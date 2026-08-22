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

/**
 * Perform a FRESH build: CFBD schedule + a live SGO/DraftKings pull, matched
 * together. This is the ONLY path that calls SportsGameOdds. The live board
 * never calls this — it reads a saved snapshot instead.
 */
export async function buildFreshMatch(ctx: SeasonContextLite): Promise<{
  cfbdGames: CfbdGameLite[]
  match: MatchResult
}> {
  const [cfbdGames, sgoEvents] = await Promise.all([
    getCfbdGameLites(ctx),
    getSgoNormalizedEvents(),
  ])
  const match = matchOddsToCfbd(cfbdGames, sgoEvents)
  return { cfbdGames, match }
}
