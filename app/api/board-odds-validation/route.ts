import { NextResponse } from "next/server"
import { getCfbdGames } from "@/lib/cfbd"
import { getCurrentContext } from "@/lib/bse/season"
import { resolveAbbr } from "@/lib/bse/teams"
import { fetchSgoNcaafEvents, normalizeSgoEvent, type SgoNormalizedEvent } from "@/lib/sgo"
import { matchOddsToCfbd, type CfbdGameLite } from "@/lib/odds-match"

/**
 * TEMPORARY validation report: confirms the value The Board will DISPLAY for
 * each game's spread/total is exactly the normalized SGO/DraftKings source
 * value (no corruption in the wiring). Compares board-derived market numbers
 * against the SGO event resolved by sgoEventID for >= 10 Week 1 games.
 *
 * Safe to delete after review. Never returns the API key.
 */

export const dynamic = "force-dynamic"

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

function abbr(team: string): string {
  const cleaned = team.replace(/[^A-Za-z0-9 ]/g, "").trim()
  const words = cleaned.split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase()
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase()
}

// Mirror of the board route's display derivation, kept in sync intentionally.
function boardMarketValues(m: {
  spread: { home: number | null }
  total: { points: number | null; withinPlausibleRange: boolean }
}, matched: boolean) {
  return {
    marketSpread: matched ? m.spread.home : null,
    marketTotal: m.total.points != null && m.total.withinPlausibleRange ? m.total.points : null,
  }
}

export async function GET() {
  try {
    const ctx = getCurrentContext()

    const [rawGames, rawEvents] = await Promise.all([
      getCfbdGames({
        year: ctx.season,
        week: ctx.week,
        seasonType: ctx.seasonType,
        division: "fbs",
      }) as Promise<CfbdGame[]>,
      fetchSgoNcaafEvents(),
    ])

    const sgoEvents = rawEvents.map(normalizeSgoEvent)

    // Independent index of the SGO source-of-truth values, keyed by eventID.
    const sgoById = new Map<string, SgoNormalizedEvent>()
    for (const ev of sgoEvents) if (ev.eventID) sgoById.set(ev.eventID, ev)

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
      away: { name: g.awayTeam, abbr: abbr(g.awayTeam) },
      home: { name: g.homeTeam, abbr: abbr(g.homeTeam) },
    }))

    const match = matchOddsToCfbd(cfbdGames, sgoEvents)
    const matched = match.games.filter((g) => g.oddsStatus === "matched")

    const comparisons = matched.map((g) => {
      const board = boardMarketValues(g.market, true)
      const source = g.sgoEventID ? sgoById.get(g.sgoEventID) : undefined
      const srcSpread = source?.market.spread.home ?? null
      const srcTotalRaw = source?.market.total.points ?? null
      const srcTotalPlausible = source?.market.total.withinPlausibleRange ?? true
      const srcTotalDisplay = srcTotalRaw != null && srcTotalPlausible ? srcTotalRaw : null

      const spreadMatch = board.marketSpread === srcSpread
      const totalMatch = board.marketTotal === srcTotalDisplay

      return {
        matchup: `${g.away.name} @ ${g.home.name}`,
        sgoEventID: g.sgoEventID,
        boardSpread: board.marketSpread,
        sourceSpread: srcSpread,
        spreadMatch,
        boardTotal: board.marketTotal,
        sourceTotal: srcTotalDisplay,
        totalMatch,
        sourceOddIDs: g.market.sourceOddIDs,
        updatedAt: g.market.updatedAt,
      }
    })

    const mismatches = comparisons.filter((c) => !c.spreadMatch || !c.totalMatch)

    return NextResponse.json({
      ok: true,
      season: ctx.season,
      week: ctx.week,
      counts: {
        cfbdFbsGames: cfbdGames.length,
        matched: match.matchedCount,
        unmatched: match.unmatchedCount,
        compared: comparisons.length,
        mismatches: mismatches.length,
      },
      allValuesMatch: mismatches.length === 0,
      sample: comparisons.slice(0, 12),
      mismatches,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
