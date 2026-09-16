import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { getCurrentContext } from "@/lib/bse/season"
import { rawWeekForCanonical } from "@/lib/bse/week-identity"
import {
  refreshSnapshot,
  loadSnapshot,
  acquireRefreshLock,
  releaseRefreshLock,
} from "@/lib/odds-snapshot"
import { SgoRateLimitError } from "@/lib/sgo"
import { pool } from "@/lib/db"
import { loadFrozenArtifact } from "@/scripts/hist/final/score-frozen.mjs"
import { runCapture, CaptureError } from "@/scripts/hist/final/capture-core.mjs"

/**
 * AUTOMATIC scheduled BSE rating capture (Vercel Cron).
 *
 * This is the unattended equivalent of the two manual Admin steps
 * ("Refresh DraftKings Lines" → "Generate BSE Ratings"). Its whole purpose is
 * to keep the current BSE week's board populated so the homepage hero and Board
 * never sit empty after a week rollover, WITHOUT a human clicking anything.
 *
 * It runs in two best-effort phases for the CANONICAL current week:
 *
 *   1) REFRESH LINES (best effort): pull fresh DraftKings odds and save a new
 *      frozen snapshot, guarded by the same durable lock the manual route uses.
 *      A SportsGameOdds 429 (rate limit) is NON-FATAL here: we log it and fall
 *      through to phase 2, because a recent existing snapshot may still be fresh
 *      enough to capture from. The frozen snapshot is never left half-written.
 *
 *   2) CAPTURE RATINGS: score the IMMUTABLE frozen artifact against the current
 *      snapshot via the SAME shared core the CLI and Admin use
 *      (scripts/hist/final/capture-core.mjs). It NEVER retrains or replaces the
 *      model, inserts IMMUTABLE shadow signals with ON CONFLICT DO NOTHING (a
 *      prior capture is never overwritten), refreshes only the mutable board
 *      display cache, and FAILS CLOSED on a missing/stale snapshot rather than
 *      fabricating any line or rating.
 *
 * Because the capture is idempotent, running this repeatedly through the week is
 * safe: already-captured games are left untouched and only newly-lined games are
 * added while leans are refreshed from the latest lines.
 *
 * SECURITY: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. We verify it
 * in constant time and fail closed when CRON_SECRET is unset, so arbitrary
 * public requests cannot trigger a capture. The manual admin paths remain
 * available as backup controls.
 */

export const dynamic = "force-dynamic"
// Refresh + capture can take a while (SGO pull + scoring the whole slate).
export const maxDuration = 300

function isAuthorizedCron(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false // fail closed
  const auth = request.headers.get("authorization") ?? ""
  const presented = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : ""
  if (!presented) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Phase 1 — refresh DraftKings lines, best effort. Returns a structured result
 * describing what happened; never throws for expected conditions (rate limit,
 * busy lock) so phase 2 can still run against the existing snapshot.
 */
async function refreshLinesBestEffort(ctx: ReturnType<typeof getCurrentContext>): Promise<{
  attempted: boolean
  refreshed: boolean
  detail: string
  rateLimited?: boolean
  retryAfterSeconds?: number | null
  summary?: Awaited<ReturnType<typeof refreshSnapshot>>
}> {
  const lock = await acquireRefreshLock()
  if (!lock.acquired) {
    return { attempted: false, refreshed: false, detail: "Another refresh is already running; skipped line refresh." }
  }
  try {
    const summary = await refreshSnapshot({
      season: ctx.season,
      week: ctx.week,
      seasonType: ctx.seasonType,
    })
    return { attempted: true, refreshed: true, detail: "DraftKings lines refreshed.", summary }
  } catch (error) {
    if (error instanceof SgoRateLimitError) {
      // Non-fatal: fall through to capture on the existing snapshot.
      console.warn("[v0] cron refresh-ratings: SGO rate limited during line refresh; will try capture on existing snapshot")
      return {
        attempted: true,
        refreshed: false,
        rateLimited: true,
        retryAfterSeconds: error.retryAfterSeconds ?? null,
        detail: "Line refresh rate limited; existing snapshot left unchanged.",
      }
    }
    console.error("[v0] cron refresh-ratings: line refresh failed (non-fatal), will try capture on existing snapshot:", error)
    return {
      attempted: true,
      refreshed: false,
      detail: `Line refresh failed (${error instanceof Error ? error.message : "unknown"}); existing snapshot left unchanged.`,
    }
  } finally {
    await releaseRefreshLock()
  }
}

async function run(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const ctx = getCurrentContext()
  const rawWeek = rawWeekForCanonical(ctx.week)

  // Phase 1: best-effort fresh lines.
  const refresh = await refreshLinesBestEffort(ctx)

  // Phase 2: capture ratings against the current snapshot.
  let artifact: unknown
  try {
    artifact = loadFrozenArtifact()
  } catch {
    return NextResponse.json(
      { ok: false, phase: "capture", refresh, error: "Frozen model artifact unavailable." },
      { status: 500 },
    )
  }

  const snapshot = await loadSnapshot()
  const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows

  try {
    const capture = await runCapture({
      q,
      artifact,
      snapshot,
      season: ctx.season,
      week: rawWeek, // capture core works in RAW provider-week space
    })
    return NextResponse.json({ ok: true, season: ctx.season, week: ctx.week, rawWeek, refresh, capture })
  } catch (err) {
    if (err instanceof CaptureError) {
      // Expected fail-closed condition (no/stale snapshot). Nothing was written.
      // 200 with ok:false so the cron run isn't flagged as an infra failure —
      // this is a legitimate "no fresh data to capture yet" state.
      return NextResponse.json(
        { ok: false, phase: "capture", refresh, error: err.message },
        { status: 200 },
      )
    }
    console.error("[v0] cron refresh-ratings capture failed:", err)
    return NextResponse.json(
      { ok: false, phase: "capture", refresh, error: "Capture failed unexpectedly." },
      { status: 500 },
    )
  }
}

// Vercel Cron issues GET requests.
export async function GET(request: NextRequest) {
  return run(request)
}
