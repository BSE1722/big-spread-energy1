import { NextResponse } from "next/server"
import { getCfbdGames } from "@/lib/cfbd"
import { getCurrentContext } from "@/lib/bse/season"
import { getSgoNormalizedEvents } from "@/lib/sgo"
import { matchOddsToCfbd, type CfbdGameLite } from "@/lib/odds-match"
import { resolveAbbr } from "@/lib/bse/teams"

/**
 * TEMPORARY diagnostic report for the SportsGameOdds integration.
 *
 * Returns exactly the pre-flight review requested before wiring odds site-wide:
 *   1. Five matched Week 1 CFBD games with DraftKings spread / moneyline / total.
 *   2. Unmatched games and the reason each failed.
 *   3. The normalized data shape destined for the BSE prediction engine.
 *
 * Never returns the API key. Safe to delete after review.
 */

export const dynamic = "force-dynamic"

function abbr(team: string): string {
  const cleaned = team.replace(/[^A-Za-z0-9 ]/g, "").trim()
  const words = cleaned.split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase()
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase()
}

interface CfbdGame {
  id: number
  season: number
  week: number
  startDate: string
  startTimeTBD: boolean
  neutralSite: boolean
  homeTeam: string
  homeClassification: string | null
  awayTeam: string
  awayClassification: string | null
}

export async function GET() {
  try {
    const ctx = getCurrentContext()

    const [rawGames, sgoEvents] = await Promise.all([
      getCfbdGames({
        year: ctx.season,
        week: ctx.week,
        seasonType: ctx.seasonType,
        division: "fbs",
      }) as Promise<CfbdGame[]>,
      getSgoNormalizedEvents(),
    ])

    const fbs = (Array.isArray(rawGames) ? rawGames : []).filter(
      (g) =>
        (g.homeClassification == null || g.homeClassification === "fbs") &&
        (g.awayClassification == null || g.awayClassification === "fbs"),
    )

    const cfbdGames: CfbdGameLite[] = fbs.map((g) => ({
      id: `cfbd-${g.id}`,
      season: g.season,
      week: g.week,
      kickoff: g.startDate,
      kickoffTBD: g.startTimeTBD,
      neutralSite: g.neutralSite,
      away: { name: g.awayTeam, abbr: resolveAbbr(g.awayTeam) ?? abbr(g.awayTeam) },
      home: { name: g.homeTeam, abbr: resolveAbbr(g.homeTeam) ?? abbr(g.homeTeam) },
    }))

    const result = matchOddsToCfbd(cfbdGames, sgoEvents)

    // 1. Five matched games with DK spread / moneyline / total.
    const matchedSample = result.games
      .filter((g) => g.oddsStatus === "matched")
      .slice(0, 5)
      .map((g) => ({
        matchup: `${g.away.name} @ ${g.home.name}`,
        kickoff: g.kickoff,
        spread: {
          home: `${g.home.abbr} ${g.market.spread.home ?? "?"} (${g.market.spread.homePrice ?? "?"})`,
          away: `${g.away.abbr} ${g.market.spread.away ?? "?"} (${g.market.spread.awayPrice ?? "?"})`,
        },
        moneyline: {
          home: `${g.home.abbr} ${g.market.moneyline.home ?? "?"}`,
          away: `${g.away.abbr} ${g.market.moneyline.away ?? "?"}`,
        },
        total: {
          points: g.market.total.points,
          over: g.market.total.overPrice,
          under: g.market.total.underPrice,
        },
        updatedAt: g.market.updatedAt,
      }))

    // 3. The exact normalized object shape passed into the BSE engine.
    const normalizedShapeSample = result.games.find((g) => g.oddsStatus === "matched") ?? null

    return NextResponse.json({
      ok: true,
      season: ctx.season,
      week: ctx.week,
      counts: {
        cfbdFbsGames: cfbdGames.length,
        sgoEventsFetched: sgoEvents.length,
        matched: result.matchedCount,
        unmatched: result.unmatchedCount,
      },
      matchedSample,
      unmatched: result.unmatched,
      normalizedShapeSample,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
