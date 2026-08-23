import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { getCurrentContext } from "@/lib/bse/season"
import { refreshSnapshot, loadSnapshot, acquireRefreshLock, releaseRefreshLock } from "@/lib/odds-snapshot"
import { SgoRateLimitError, fetchSgoAccountUsage, type SgoUsageReport } from "@/lib/sgo"

/**
 * ADMIN-ONLY manual odds refresh.
 *
 * - POST triggers a fresh SportsGameOdds pull, saves a new frozen snapshot, and
 *   returns { refreshed, matched, unmatched, snapshotAt }.
 * - GET returns the CURRENT snapshot status (no upstream call). GET ?usage=1
 *   queries SGO /account/usage and reports which quota is being consumed.
 *
 * Gated by the ADMIN_REFRESH_SECRET env var. Ordinary visitors cannot trigger a
 * refresh: without the secret every request is rejected with 401. The secret is
 * compared in constant time and is never returned to the client.
 *
 * Rate-limit handling: a 429 from SGO is surfaced immediately (no retry loop),
 * the frozen snapshot is left untouched, and we report the Retry-After delay
 * plus which quota tripped. Concurrent refreshes are blocked by a durable lock.
 */

export const dynamic = "force-dynamic"

function presentedSecret(request: NextRequest): string {
  const header = request.headers.get("x-admin-secret")
  if (header) return header
  const auth = request.headers.get("authorization") ?? ""
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : ""
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.ADMIN_REFRESH_SECRET
  if (!expected) return false // fail closed when not configured
  const presented = presentedSecret(request)
  if (!presented) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Human-readable summary of which quota tripped, for the admin message. */
function describeLimit(usage: SgoUsageReport | null): string {
  if (!usage) return "unknown limit (usage lookup unavailable)"
  switch (usage.limitHit) {
    case "per-minute":
      return "per-minute request limit"
    case "hourly":
      return "hourly request limit"
    case "monthly-objects":
      return "monthly objects limit"
    default:
      return "unknown limit (could not determine from usage)"
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // On-demand SGO usage report (single read-only request, no snapshot change).
  if (request.nextUrl.searchParams.get("usage") === "1") {
    try {
      const usage = await fetchSgoAccountUsage()
      return NextResponse.json({ ok: true, usage })
    } catch (error) {
      if (error instanceof SgoRateLimitError) {
        return NextResponse.json(
          {
            ok: false,
            rateLimited: true,
            retryAfterSeconds: error.retryAfterSeconds,
            error: rateLimitMessage(error.retryAfterSeconds, null),
          },
          { status: 429 },
        )
      }
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Usage lookup failed" },
        { status: 502 },
      )
    }
  }

  const snapshot = await loadSnapshot()
  return NextResponse.json({
    ok: true,
    hasSnapshot: !!snapshot,
    snapshotAt: snapshot?.snapshotAt ?? null,
    previousSnapshotAt: snapshot?.previousSnapshotAt ?? null,
    season: snapshot?.season ?? null,
    week: snapshot?.week ?? null,
    matched: snapshot?.matchedCount ?? null,
    unmatched: snapshot?.unmatchedCount ?? null,
  })
}

function rateLimitMessage(retryAfterSeconds: number | null, usage: SgoUsageReport | null): string {
  const secs = retryAfterSeconds != null ? `${retryAfterSeconds} seconds` : "a little while"
  const which = describeLimit(usage)
  return `SportsGameOdds rate limit reached (${which}). Try again in ${secs}. Existing frozen snapshot was NOT changed.`
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // Prevent double-clicks / concurrent refreshes from firing overlapping pulls.
  const lock = await acquireRefreshLock()
  if (!lock.acquired) {
    return NextResponse.json(
      {
        ok: false,
        busy: true,
        error: "A refresh is already running. Please wait for it to finish before triggering another.",
        heldSince: lock.heldSince,
      },
      { status: 409 },
    )
  }

  try {
    const ctx = getCurrentContext()
    const summary = await refreshSnapshot({
      season: ctx.season,
      week: ctx.week,
      seasonType: ctx.seasonType,
    })
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    if (error instanceof SgoRateLimitError) {
      // 429: do not retry. Report which limit tripped; snapshot is untouched.
      let usage: SgoUsageReport | null = null
      try {
        usage = await fetchSgoAccountUsage()
      } catch {
        // Usage lookup may itself be rate limited; degrade gracefully.
        usage = null
      }
      console.error("[v0] odds refresh hit SGO 429; snapshot left unchanged")
      return NextResponse.json(
        {
          ok: false,
          rateLimited: true,
          retryAfterSeconds: error.retryAfterSeconds,
          limitHit: usage?.limitHit ?? "unknown",
          usage,
          snapshotChanged: false,
          error: rateLimitMessage(error.retryAfterSeconds, usage),
        },
        { status: 429 },
      )
    }
    console.error("[v0] odds refresh failed:", error)
    return NextResponse.json(
      {
        ok: false,
        snapshotChanged: false,
        error: error instanceof Error ? error.message : "Refresh failed",
      },
      { status: 500 },
    )
  } finally {
    await releaseRefreshLock()
  }
}
