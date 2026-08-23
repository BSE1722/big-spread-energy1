import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { getCurrentContext } from "@/lib/bse/season"
import { refreshSnapshot, loadSnapshot } from "@/lib/odds-snapshot"

/**
 * ADMIN-ONLY manual odds refresh.
 *
 * - POST triggers a fresh SportsGameOdds pull, saves a new frozen snapshot, and
 *   returns { refreshed, matched, unmatched, snapshotAt }.
 * - GET returns the CURRENT snapshot status (no upstream call) so the admin page
 *   can show when lines were last set.
 *
 * Gated by the ADMIN_REFRESH_SECRET env var. Ordinary visitors cannot trigger a
 * refresh: without the secret every request is rejected with 401. The secret is
 * compared in constant time and is never returned to the client.
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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
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

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
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
    console.error("[v0] odds refresh failed:", error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Refresh failed" },
      { status: 500 },
    )
  }
}
