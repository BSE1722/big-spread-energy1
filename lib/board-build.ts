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
import { pool } from "@/lib/db"
import { rawWeekForCanonical, filterToCanonicalWeek } from "@/lib/bse/week-identity"

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
  venueId: number | null
  venue: string | null
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

/**
 * Last-known-good schedule per (season, week, seasonType), held in module memory
 * for the life of a warm server instance. The weekly CFBD schedule barely changes,
 * so when a live fetch fails — most importantly a CFBD 429 rate-limit — we serve
 * the previously fetched schedule instead of throwing and blanking the whole board.
 * A cold instance with no cached entry still surfaces the error to the caller.
 */
const lastGoodSchedule = new Map<string, CfbdGameLite[]>()
const scheduleKey = (ctx: SeasonContextLite) => `${ctx.season}-${ctx.week}-${ctx.seasonType}`

/**
 * DURABLE schedule fallback: read the week's FBS schedule from our own database
 * (hist_raw_games, ingested during backfill) instead of calling CFBD. This keeps
 * the live board working through a CFBD outage or an exhausted monthly quota,
 * and — unlike the in-memory cache — survives cold serverless starts. It is a
 * fallback only; a healthy CFBD fetch is still the primary source of truth.
 */
async function loadScheduleFromDb(ctx: SeasonContextLite): Promise<CfbdGameLite[]> {
  // ctx.week is the CANONICAL BSE week. The stored schedule uses the RAW provider
  // week (CFBD lumps Week 0 + Week 1 into raw week 1), so query by raw week...
  const rawWeek = rawWeekForCanonical(ctx.week)
  const { rows } = await pool.query(
    `select "gameId", season, week, "startDate", "startTimeTBD", "neutralSite",
            "venueId", "homeTeam", "awayTeam", raw
       from hist_raw_games
      where season = $1 and week = $2 and "seasonType" = $3
        and ("homeClassification" is null or "homeClassification" = 'fbs')
        and ("awayClassification" is null or "awayClassification" = 'fbs')
      order by "startDate"`,
    [ctx.season, rawWeek, ctx.seasonType],
  )

  const lites = rows.map((r: Record<string, unknown>) => {
    let venueName: string | null = null
    try {
      const parsed = typeof r.raw === "string" ? JSON.parse(r.raw) : r.raw
      venueName = (parsed as { venue?: string | null } | null)?.venue ?? null
    } catch {
      venueName = null
    }
    const homeTeam = String(r.homeTeam)
    const awayTeam = String(r.awayTeam)
    return {
      id: `cfbd-${r.gameId}`,
      season: Number(r.season),
      week: Number(r.week), // RAW provider week — preserved as stored.
      kickoff: r.startDate ? new Date(r.startDate as string).toISOString() : "",
      kickoffTBD: Boolean(r.startTimeTBD),
      neutralSite: Boolean(r.neutralSite),
      venueId: r.venueId == null ? null : Number(r.venueId),
      venueName,
      away: { name: awayTeam, abbr: abbr(awayTeam) },
      home: { name: homeTeam, abbr: abbr(homeTeam) },
    }
  })

  // ...then narrow raw week 1 down to the exact canonical slate by kickoff date.
  return filterToCanonicalWeek(lites, ctx.week)
}

/** Serve the best available fallback schedule: in-memory cache, then database. */
async function fallbackSchedule(ctx: SeasonContextLite, key: string, err: unknown): Promise<CfbdGameLite[]> {
  const cached = lastGoodSchedule.get(key)
  if (cached && cached.length > 0) {
    console.error(`[v0] CFBD schedule failed for ${key}; serving in-memory last-known-good (${cached.length}):`, err)
    return cached
  }
  try {
    const fromDb = await loadScheduleFromDb(ctx)
    if (fromDb.length > 0) {
      console.error(`[v0] CFBD schedule failed for ${key}; serving DB schedule (${fromDb.length} games):`, err)
      lastGoodSchedule.set(key, fromDb)
      return fromDb
    }
  } catch (dbErr) {
    console.error(`[v0] DB schedule fallback also failed for ${key}:`, dbErr)
  }
  // Nothing to serve — let the caller degrade honestly.
  throw err
}

/** Fetch the CFBD schedule (source of truth) and shape it for the matcher. */
export async function getCfbdGameLites(ctx: SeasonContextLite): Promise<CfbdGameLite[]> {
  const key = scheduleKey(ctx)

  // ctx.week is CANONICAL; CFBD only understands the RAW provider week (Week 0
  // and Week 1 both live under raw week 1), so ask CFBD for the raw week.
  const rawWeek = rawWeekForCanonical(ctx.week)

  let raw: CfbdGame[]
  try {
    raw = (await getCfbdGames({
      year: ctx.season,
      week: rawWeek,
      seasonType: ctx.seasonType,
      division: "fbs",
    })) as CfbdGame[]
  } catch (err) {
    // CFBD unavailable (e.g. 429 rate limit / monthly quota) → durable fallback.
    return fallbackSchedule(ctx, key, err)
  }

  const games = Array.isArray(raw) ? raw : []

  const fbs = games.filter(
    (g) =>
      (g.homeClassification == null || g.homeClassification === "fbs") &&
      (g.awayClassification == null || g.awayClassification === "fbs"),
  )

  const allLites = fbs.map((g) => ({
    id: `cfbd-${g.id}`,
    season: g.season,
    week: g.week, // RAW provider week — preserved as returned by CFBD.
    kickoff: g.startDate,
    kickoffTBD: g.startTimeTBD,
    neutralSite: g.neutralSite,
    venueId: g.venueId ?? null,
    venueName: g.venue ?? null,
    away: { name: g.awayTeam, abbr: abbr(g.awayTeam) },
    home: { name: g.homeTeam, abbr: abbr(g.homeTeam) },
  }))

  // Narrow raw week 1 down to the exact canonical slate (Week 0 vs Week 1) by
  // kickoff date. For raw weeks >= 2 this is a pass-through.
  const lites = filterToCanonicalWeek(allLites, ctx.week)

  // A successful-but-empty CFBD response (can happen under quota edge cases)
  // should not blank the board — fall back to a stored schedule if we have one.
  if (lites.length === 0) {
    try {
      return await fallbackSchedule(ctx, key, new Error("CFBD returned an empty schedule"))
    } catch {
      return lites // truly nothing anywhere; return empty and let caller degrade
    }
  }

  // Only overwrite the fallback with a non-empty result so a transient empty
  // response can't wipe a good cached schedule.
  lastGoodSchedule.set(key, lites)

  return lites
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
