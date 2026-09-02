import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { getCurrentContext } from "@/lib/bse/season"
import { rawWeekForCanonical } from "@/lib/bse/week-identity"
import { loadSnapshot } from "@/lib/odds-snapshot"
import { isAdmin } from "@/lib/admin-auth"
import { pool } from "@/lib/db"
import { loadFrozenArtifact } from "@/scripts/hist/final/score-frozen.mjs"
import { runCapture, CaptureError } from "@/scripts/hist/final/capture-core.mjs"

/**
 * ADMIN-ONLY "Generate BSE Ratings".
 *
 * Executes the EXISTING frozen-model capture for the CANONICAL current BSE week
 * by calling the SAME shared core (scripts/hist/final/capture-core.mjs) the CLI
 * uses — there is no parallel scoring logic. It:
 *   - loads the immutable frozen artifact (nTrees=52) and scores it as-is;
 *     it NEVER retrains, tunes, or replaces the model,
 *   - reads the EXISTING DraftKings blob snapshot (zero new SGO/CFBD calls),
 *   - upserts the mutable board display cache and inserts IMMUTABLE shadow
 *     signals (ON CONFLICT DO NOTHING — never overwrites a prior capture),
 *   - fails closed on a missing/stale snapshot and never fabricates inputs.
 *
 * Auth mirrors the odds-refresh route: a signed-in admin session OR the machine
 * secret. The UI never sees the secret.
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
  if (!expected) return false
  const presented = presentedSecret(request)
  if (!presented) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  if (hasValidSecret(request)) return true
  return await isAdmin()
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const ctx = getCurrentContext()
  const rawWeek = rawWeekForCanonical(ctx.week)

  let artifact: unknown
  try {
    artifact = loadFrozenArtifact()
  } catch {
    return NextResponse.json({ ok: false, error: "Frozen model artifact unavailable." }, { status: 500 })
  }

  const snapshot = await loadSnapshot()

  const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows

  try {
    const summary = await runCapture({
      q,
      artifact,
      snapshot,
      season: ctx.season,
      week: rawWeek, // capture core works in RAW provider-week space
    })
    return NextResponse.json({ ok: true, season: ctx.season, week: ctx.week, rawWeek, summary })
  } catch (err) {
    if (err instanceof CaptureError) {
      // Expected fail-closed conditions (no/stale snapshot). Nothing was written.
      return NextResponse.json({ ok: false, error: err.message }, { status: 409 })
    }
    console.error("[v0] generate-ratings capture failed:", err)
    return NextResponse.json({ ok: false, error: "Capture failed unexpectedly." }, { status: 500 })
  }
}
