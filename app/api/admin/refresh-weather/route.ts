import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { getCurrentContext } from "@/lib/bse/season"
import { refreshWeather } from "@/lib/weather/refresh"
import { syncVenues, venueCount } from "@/lib/weather/venues"
import { getWeekWeather } from "@/lib/weather/store"
import { isAdmin } from "@/lib/admin-auth"

/**
 * ADMIN-ONLY weather ingestion.
 *
 * - POST triggers one cadence-aware ingestion pass for the current week
 *   (CFBD schedule → venue coords → provider fetch → Neon `game_weather`).
 *   POST ?sync-venues=1 first refreshes the CFBD venue cache.
 * - GET returns the current week's stored-weather status counts (no upstream
 *   call). GET ?venues=1 reports how many venues are cached.
 *
 * Gated by ADMIN_REFRESH_SECRET, compared in constant time (same gate as the
 * odds refresh). This path is fully independent of the DraftKings/SGO snapshot.
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

/** Valid machine secret (cron/scripts) OR a signed-in admin session (UI). */
async function isAuthorized(request: NextRequest): Promise<boolean> {
  if (hasValidSecret(request)) return true
  return await isAdmin()
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  if (request.nextUrl.searchParams.get("venues") === "1") {
    return NextResponse.json({ ok: true, venues: await venueCount() })
  }

  const ctx = getCurrentContext()
  const rows = await getWeekWeather(ctx.season, ctx.week)

  // Latest row per game → status snapshot for the week.
  const latestByGame = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    if (!latestByGame.has(r.cfbdGameId)) latestByGame.set(r.cfbdGameId, r)
  }
  const latest = [...latestByGame.values()]
  const counts = { ok: 0, indoor: 0, pending_kickoff: 0, unavailable: 0 }
  for (const r of latest) {
    counts[r.dataStatus as keyof typeof counts] = (counts[r.dataStatus as keyof typeof counts] ?? 0) + 1
  }

  return NextResponse.json({
    ok: true,
    season: ctx.season,
    week: ctx.week,
    gamesWithWeather: latest.length,
    totalRowsThisWeek: rows.length,
    finalPregameFrozen: latest.filter((r) => r.isFinalPregame).length,
    statusCounts: counts,
    lastFetchedAt: rows[0]?.fetchedAt ?? null,
  })
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    let venuesSynced: number | null = null
    if (request.nextUrl.searchParams.get("sync-venues") === "1") {
      venuesSynced = (await syncVenues()).synced
    }

    const ctx = getCurrentContext()
    const summary = await refreshWeather({
      season: ctx.season,
      week: ctx.week,
      seasonType: ctx.seasonType,
    })
    return NextResponse.json({ ok: true, venuesSynced, ...summary })
  } catch (error) {
    console.error("[v0] weather refresh failed:", error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Weather refresh failed" },
      { status: 500 },
    )
  }
}
