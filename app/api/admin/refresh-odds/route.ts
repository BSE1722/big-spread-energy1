import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { getCurrentContext } from "@/lib/bse/season"
import { refreshSnapshot, loadSnapshot, acquireRefreshLock, releaseRefreshLock } from "@/lib/odds-snapshot"
import { SgoRateLimitError, fetchSgoAccountUsage, type SgoUsageReport } from "@/lib/sgo"
import { isAdmin } from "@/lib/admin-auth"

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

function hasValidSecret(request: NextRequest): boolean {
  const expected = process.env.ADMIN_REFRESH_SECRET
  if (!expected) return false // fail closed when not configured
  const presented = presentedSecret(request)
  if (!presented) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Authorized if EITHER: (a) a valid machine secret is presented (for cron /
 * scripts), OR (b) the request comes from a signed-in admin session (for the
 * dashboard UI). Both are server-side checks; the UI never sees the secret.
 */
async function isAuthorized(request: NextRequest): Promise<boolean> {
  if (hasValidSecret(request)) return true
  return await isAdmin()
}

/** Human-readable summary of which quota tripped, for the admin message. */
function describeLimit(usage: SgoUsageReport | null): string {
  if (!usage) return "unknown limit (usage lookup unavailable)"
  switch (usage.limitHit) {
    case "per-minute-requests":
      return "per-minute request limit"
    case "per-hour-requests":
      return "hourly request limit"
    case "per-hour-entities":
      return "hourly objects (entities) limit"
    case "per-day-requests":
      return "daily request limit"
    case "per-day-entities":
      return "daily objects (entities) limit"
    case "per-month-entities":
      return "monthly objects (entities) limit"
    default:
      return "unknown limit (could not determine from usage)"
  }
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
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

/**
 * Inspect a usage report and return the first exhausted quota (if any). Used as
 * a PRE-FLIGHT gate so we never fire an odds request when we already know a cap
 * is blown — this avoids wasting entity/request budget on a guaranteed 429.
 */
function firstExhaustedQuota(usage: SgoUsageReport): {
  kind: string
  current: number | null
  max: number | null
} | null {
  const checks: Array<{ kind: string; q: { current: number | null; max: number | null; exceeded: boolean } }> = [
    { kind: "per-minute-requests", q: usage.perMinute.requests },
    { kind: "per-hour-requests", q: usage.perHour.requests },
    { kind: "per-hour-entities", q: usage.perHour.entities },
    { kind: "per-day-requests", q: usage.perDay.requests },
    { kind: "per-day-entities", q: usage.perDay.entities },
    { kind: "per-month-entities", q: usage.perMonth.entities },
  ]
  for (const c of checks) {
    if (c.q.exceeded) return { kind: c.kind, current: c.q.current, max: c.q.max }
  }
  return null
}

/** Clean message for a pre-flight abort (before any odds request was made). */
function preflightMessage(kind: string, current: number | null, max: number | null): string {
  const used = current != null ? current.toLocaleString() : "?"
  const cap = max != null ? max.toLocaleString() : "?"
  return `SportsGameOdds ${kind.replace(/-/g, " ")} quota is exhausted (${used} / ${cap}). Refresh aborted BEFORE any odds request; the existing frozen snapshot was NOT changed.`
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // PRE-FLIGHT: check SGO account usage BEFORE attempting any odds request. If a
  // quota (e.g. monthly entities) is already exhausted, abort here so we never
  // spend budget on a call that is guaranteed to 429. This is a single
  // request-based /account/usage read; it does not consume entity budget.
  try {
    const usage = await fetchSgoAccountUsage()
    const blocked = firstExhaustedQuota(usage)
    if (blocked) {
      console.error(`[v0] refresh pre-flight abort: ${blocked.kind} exhausted; no odds request made`)
      return NextResponse.json(
        {
          ok: false,
          rateLimited: true,
          preflight: true,
          limitHit: blocked.kind,
          usage,
          snapshotChanged: false,
          error: preflightMessage(blocked.kind, blocked.current, blocked.max),
        },
        { status: 429 },
      )
    }
  } catch (error) {
    // If the usage probe itself is rate limited, abort too — a refresh would
    // only make it worse. Any other probe error is non-fatal: fall through and
    // let the refresh attempt proceed (it has its own 429 handling).
    if (error instanceof SgoRateLimitError) {
      return NextResponse.json(
        {
          ok: false,
          rateLimited: true,
          preflight: true,
          retryAfterSeconds: error.retryAfterSeconds,
          snapshotChanged: false,
          error: rateLimitMessage(error.retryAfterSeconds, error.usage ?? null),
        },
        { status: 429 },
      )
    }
    console.log("[v0] usage pre-flight probe failed (non-fatal), proceeding:", (error as Error)?.message)
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
