import { NextRequest, NextResponse } from "next/server"
import { getCfbdGames } from "@/lib/cfbd"
import { getCurrentContext } from "@/lib/bse/season"

/**
 * Live board feed for The Board + homepage Top Edges.
 *
 * Returns the REAL FBS games for the active season/week (from the centralized
 * season source of truth) shaped for the board UI. Projection / edge / rating
 * fields are intentionally left null — the caller renders them as clearly
 * labeled placeholders until live BSE model output exists. We never invent fake
 * model numbers on top of real games.
 */

interface CfbdGame {
  id: number
  season: number
  week: number
  seasonType: string
  startDate: string
  startTimeTBD: boolean
  neutralSite: boolean
  homeTeam: string
  homeClassification: string | null
  homePoints: number | null
  awayTeam: string
  awayClassification: string | null
  awayPoints: number | null
}

function abbr(team: string): string {
  // Compact fallback abbreviation from the team name (uppercased, no spaces).
  const cleaned = team.replace(/[^A-Za-z0-9 ]/g, "").trim()
  const words = cleaned.split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase()
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase()
}

export async function GET(_request: NextRequest) {
  try {
    const ctx = getCurrentContext()

    const raw = (await getCfbdGames({
      year: ctx.season,
      week: ctx.week,
      seasonType: ctx.seasonType,
      division: "fbs",
    })) as CfbdGame[]

    const games = Array.isArray(raw) ? raw : []

    // Keep FBS-vs-FBS matchups; both sides classified as fbs when present.
    const fbs = games.filter(
      (g) =>
        (g.homeClassification == null || g.homeClassification === "fbs") &&
        (g.awayClassification == null || g.awayClassification === "fbs"),
    )

    const rows = fbs
      .map((g) => ({
        id: `cfbd-${g.id}`,
        season: g.season,
        week: g.week,
        kickoff: g.startDate,
        kickoffTBD: g.startTimeTBD,
        neutralSite: g.neutralSite,
        away: { name: g.awayTeam, abbr: abbr(g.awayTeam) },
        home: { name: g.homeTeam, abbr: abbr(g.homeTeam) },
        // Placeholder model fields — populated when live BSE projections exist.
        marketSpread: null as number | null,
        marketTotal: null as number | null,
        fairSpread: null as number | null,
        fairTotal: null as number | null,
        edgeSpread: null as number | null,
        edgeTotal: null as number | null,
        bseRating: null as number | null,
        pick: null as string | null,
      }))
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())

    return NextResponse.json({
      ok: true,
      season: ctx.season,
      week: ctx.week,
      seasonType: ctx.seasonType,
      projectionsAvailable: false,
      count: rows.length,
      games: rows,
    })
  } catch (error) {
    console.error("CFBD board failed:", error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
