/**
 * Shared CFBD → matcher build used by BOTH the live board feed and the manual
 * odds-refresh job, so they run identical, already-validated logic.
 *
 * SOURCE OF TRUTH SPLIT:
 *   - CFBD  → schedule, teams, kickoff times, IDs, game identity.
 *   - SGO/DraftKings → live betting markets ONLY.
 */

import { getCfbdGames } from "@/lib/cfbd"
import { getSgoNormalizedEvents } from "@/lib/sgo"
import { matchOddsToCfbd, type CfbdGameLite, type MatchResult } from "@/lib/odds-match"

export interface SeasonContextLite {
  season: number
  week: number
  seasonType: "regular" | "postseason"
}

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

/** Compact fallback abbreviation from a team name (uppercased, no spaces). */
export function abbr(team: string): string {
  const cleaned = team.replace(/[^A-Za-z0-9 ]/g, "").trim()
  const words = cleaned.split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase()
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase()
}

/** Fetch the CFBD schedule (source of truth) and shape it for the matcher. */
export async function getCfbdGameLites(ctx: SeasonContextLite): Promise<CfbdGameLite[]> {
  const raw = (await getCfbdGames({
    year: ctx.season,
    week: ctx.week,
    seasonType: ctx.seasonType,
    division: "fbs",
  })) as CfbdGame[]

  const games = Array.isArray(raw) ? raw : []

  const fbs = games.filter(
    (g) =>
      (g.homeClassification == null || g.homeClassification === "fbs") &&
      (g.awayClassification == null || g.awayClassification === "fbs"),
  )

  return fbs.map((g) => ({
    id: `cfbd-${g.id}`,
    season: g.season,
    week: g.week,
    kickoff: g.startDate,
    kickoffTBD: g.startTimeTBD,
    neutralSite: g.neutralSite,
    away: { name: g.awayTeam, abbr: abbr(g.awayTeam) },
    home: { name: g.homeTeam, abbr: abbr(g.homeTeam) },
  }))
}

/** Pad (ms) applied on each side of the week's kickoff range for the SGO window. */
const WEEK_WINDOW_PAD_MS = 24 * 60 * 60 * 1000

/**
 * Derive an SGO date window [startsAfter, startsBefore] from the target week's
 * CFBD kickoffs (min − 1 day … max + 1 day). Bounding the odds pull to the week
 * instead of the whole season is the primary entity-usage saver. Returns nulls
 * when no kickoffs are available (caller then omits the window).
 */
export function deriveWeekWindow(games: CfbdGameLite[]): {
  startsAfter: string | null
  startsBefore: string | null
} {
  const times = games
    .map((g) => Date.parse(g.kickoff))
    .filter((t) => Number.isFinite(t))
  if (times.length === 0) return { startsAfter: null, startsBefore: null }
  const min = Math.min(...times)
  const max = Math.max(...times)
  return {
    startsAfter: new Date(min - WEEK_WINDOW_PAD_MS).toISOString(),
    startsBefore: new Date(max + WEEK_WINDOW_PAD_MS).toISOString(),
  }
}

/**
 * Perform a FRESH build: CFBD schedule + a live SGO/DraftKings pull, matched
 * together. This is the ONLY path that calls SportsGameOdds. The live board
 * never calls this — it reads a saved snapshot instead.
 *
 * CFBD is fetched FIRST so we can bound the SGO pull to the target week's date
 * window and request only the DraftKings main-line markets — retrieving only
 * the exact games/markets/bookmaker we need and minimizing SGO entity usage.
 */
export async function buildFreshMatch(ctx: SeasonContextLite): Promise<{
  cfbdGames: CfbdGameLite[]
  match: MatchResult
}> {
  const cfbdGames = await getCfbdGameLites(ctx)
  const { startsAfter, startsBefore } = deriveWeekWindow(cfbdGames)

  const sgoEvents = await getSgoNormalizedEvents({
    ...(startsAfter ? { startsAfter } : {}),
    ...(startsBefore ? { startsBefore } : {}),
    // A single week fits well within two pages of the date-windowed result.
    maxPages: 2,
    // oddIDs defaults to the 3 DraftKings main lines (spread/total/moneyline).
  })

  const match = matchOddsToCfbd(cfbdGames, sgoEvents)
  return { cfbdGames, match }
}
