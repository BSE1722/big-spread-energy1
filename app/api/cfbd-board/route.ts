import { NextRequest, NextResponse } from "next/server"
import { getCfbdGames } from "@/lib/cfbd"
import { getCurrentContext } from "@/lib/bse/season"
import { resolveAbbr } from "@/lib/bse/teams"
import { fetchSgoNcaafEvents, normalizeSgoEvent } from "@/lib/sgo"
import { matchOddsToCfbd, type CfbdGameLite, type GameWithOdds } from "@/lib/odds-match"

/**
 * Live board feed for The Board + homepage Top Edges.
 *
 * SOURCE OF TRUTH SPLIT:
 *   - CFBD  → schedule, teams, kickoff times, IDs, game identity.
 *   - SGO/DraftKings → live betting markets ONLY (spread, moneyline, total,
 *     prices, bookmaker update time).
 *
 * We attach a DraftKings line to a CFBD game only when the odds matcher makes a
 * confident match (team pair + kickoff). Otherwise the game renders with odds
 * marked unavailable — we never fabricate, infer, or substitute a line.
 *
 * Projection / edge / rating fields remain null placeholders: the BSE model
 * output is intentionally NOT wired here yet. Odds are cached at the data layer
 * (see fetchSgoNcaafEvents) so visitors share one upstream pull.
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

    // CFBD schedule (source of truth) + SGO odds fetched in parallel. Odds
    // failure must never break the schedule, so it is caught independently.
    const [raw, sgoEvents] = await Promise.all([
      getCfbdGames({
        year: ctx.season,
        week: ctx.week,
        seasonType: ctx.seasonType,
        division: "fbs",
      }) as Promise<CfbdGame[]>,
      fetchSgoNcaafEvents()
        .then((events) => events.map(normalizeSgoEvent))
        .catch((err) => {
          console.error("[v0] SGO odds fetch failed; rendering schedule without odds:", err)
          return [] as ReturnType<typeof normalizeSgoEvent>[]
        }),
    ])

    const games = Array.isArray(raw) ? raw : []

    // Keep FBS-vs-FBS matchups; both sides classified as fbs when present.
    const fbs = games.filter(
      (g) =>
        (g.homeClassification == null || g.homeClassification === "fbs") &&
        (g.awayClassification == null || g.awayClassification === "fbs"),
    )

    // Shape CFBD games for the matcher. resolveAbbr improves match rate; the
    // local abbr() stays as the displayed fallback so on-screen abbreviations
    // are unchanged.
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

    const rows = match.games
      .map((g: GameWithOdds) => {
        const m = g.market
        // A flagged (implausible) total is treated as unavailable for display,
        // but the raw value + flag are still preserved in the audit block below.
        const marketTotal =
          m.total.points != null && m.total.withinPlausibleRange ? m.total.points : null

        return {
          id: g.cfbdId,
          season: g.season,
          week: g.week,
          kickoff: g.kickoff,
          kickoffTBD: g.kickoffTBD,
          neutralSite: g.neutralSite,
          away: { name: g.away.name, abbr: g.away.abbr },
          home: { name: g.home.name, abbr: g.home.abbr },

          // Live DraftKings markets (SGO). Home-relative spread; null = unavailable.
          marketSpread: g.oddsStatus === "matched" ? m.spread.home : null,
          marketTotal,
          marketMoneyline: { home: m.moneyline.home, away: m.moneyline.away },
          oddsStatus: g.oddsStatus,

          // Internal audit metadata (traceability), preserved end-to-end.
          odds: {
            bookmaker: m.bookmaker,
            sgoEventID: g.sgoEventID,
            sourceOddIDs: m.sourceOddIDs,
            updatedAt: m.updatedAt,
            totalWithinPlausibleRange: m.total.withinPlausibleRange,
            rawTotalPoints: m.total.points,
          },

          // BSE model output — intentionally null until the engine is wired.
          fairSpread: null as number | null,
          fairTotal: null as number | null,
          edgeSpread: null as number | null,
          edgeTotal: null as number | null,
          bseRating: null as number | null,
          pick: null as string | null,
        }
      })
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())

    return NextResponse.json({
      ok: true,
      season: ctx.season,
      week: ctx.week,
      seasonType: ctx.seasonType,
      projectionsAvailable: false,
      oddsAvailable: match.matchedCount > 0,
      count: rows.length,
      oddsMatchedCount: match.matchedCount,
      oddsUnmatchedCount: match.unmatchedCount,
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
