import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { getCurrentContext } from "@/lib/bse/season"

export const dynamic = "force-dynamic"

type TeamGameRow = {
  gameId: string | number
  week: number
  startDate: string | Date
  startTimeTBD: boolean
  homeTeam: string
  awayTeam: string
  homeConference: string | null
  awayConference: string | null
  venue: string | null
}

/**
 * A team's upcoming games for the current season. Served from hist_raw_games
 * (the ingested full-season schedule) rather than a live CFBD call, so the
 * board search keeps working even when CFBD is rate-limiting. gameId matches
 * the board's `cfbd-<id>` format, so breakdown links still resolve.
 */
export async function GET(request: NextRequest) {
  const team = request.nextUrl.searchParams.get("team")

  if (!team) {
    return NextResponse.json({ ok: false, error: "Missing team parameter" }, { status: 400 })
  }

  const ctx = getCurrentContext()

  try {
    const { rows } = await pool.query<TeamGameRow>(
      `select "gameId", "week", "startDate", "startTimeTBD",
              "homeTeam", "awayTeam", "homeConference", "awayConference",
              raw->>'venue' as venue
         from hist_raw_games
        where season = $1
          and "seasonType" = $2
          and "startDate" >= now()
          and ("homeTeam" = $3 or "awayTeam" = $3)
        order by "startDate" asc`,
      [ctx.season, ctx.seasonType, team],
    )

    const games = rows.map((r) => ({
      id: Number(r.gameId),
      week: r.week,
      startDate: typeof r.startDate === "string" ? r.startDate : new Date(r.startDate).toISOString(),
      startTimeTBD: r.startTimeTBD,
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      homeConference: r.homeConference,
      awayConference: r.awayConference,
      venue: r.venue,
    }))

    return NextResponse.json({ ok: true, team, count: games.length, games })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("CFBD team games failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
