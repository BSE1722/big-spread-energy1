import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { getCurrentContext } from "@/lib/bse/season"
import { refreshWeather } from "@/lib/weather/refresh"

/**
 * AUTOMATIC scheduled weather ingestion (Vercel Cron).
 *
 * Runs one cadence-aware ingestion pass for the current week:
 *   CFBD schedule → venue coords → provider fetch → Neon `game_weather`.
 *
 * This is scheduling/freshness infrastructure ONLY. It ingests real,
 * stadium-accurate, kickoff-hour forecasts and stores them with retrieval
 * timestamps. It does NOT compute or alter any BSE Rating, fair line, weather
 * weighting, or classification threshold, and it never touches the odds
 * snapshot.
 *
 * COST DISCIPLINE: the per-game cadence gate (lib/weather/cadence) decides which
 * games are actually "due", so firing this frequently is cheap — completed
 * games are frozen (no fetch), dome/indoor games record an `indoor` state
 * without an upstream call, games outside the useful window are skipped, and a
 * game not yet due is skipped. The finest tier is every 30 minutes inside 6h of
 * kickoff, so the cron is scheduled every 30 minutes to honor it.
 *
 * SECURITY: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. We verify it
 * in constant time and fail closed when CRON_SECRET is unset, so arbitrary
 * public requests cannot trigger ingestion. The manual admin path
 * (/api/admin/refresh-weather, gated by ADMIN_REFRESH_SECRET or an admin
 * session) remains available as a backup/debug control.
 */

export const dynamic = "force-dynamic"

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

async function run(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  try {
    const ctx = getCurrentContext()
    const summary = await refreshWeather({
      season: ctx.season,
      week: ctx.week,
      seasonType: ctx.seasonType,
    })
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    console.error("[v0] cron refresh-weather failed:", error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Weather refresh failed" },
      { status: 500 },
    )
  }
}

// Vercel Cron issues GET requests.
export async function GET(request: NextRequest) {
  return run(request)
}
