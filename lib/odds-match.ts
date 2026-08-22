/**
 * Match SportsGameOdds (SGO) events to CFBD games.
 *
 * CFBD is the source of truth for schedule + game identity. We attach a
 * DraftKings market line to a CFBD game only when we can confidently match on
 * BOTH the (unordered) team pair AND kickoff proximity. Anything less is marked
 * `unmatched` with a reason — we never guess a line onto the wrong game.
 *
 * Team identity is resolved through the centralized registry (`resolveAbbr`),
 * with a fuzzy fallback for SGO's "School Mascot" naming (e.g. "Ohio State
 * Buckeyes"), so both feeds collapse to the same CFBD abbreviation.
 */

import { resolveAbbr, TEAM_TABLE } from "@/lib/bse/teams"
import type { NormalizedMarket, SgoNormalizedEvent } from "@/lib/sgo"

/** Kickoff times must be within this window to count as the same game. */
const KICKOFF_WINDOW_HOURS = 30

export interface CfbdGameLite {
  id: string
  season: number
  week: number
  kickoff: string
  kickoffTBD: boolean
  neutralSite: boolean
  home: { name: string; abbr: string }
  away: { name: string; abbr: string }
}

/** Line-movement scaffold — nullable now, populated once history is stored. */
export interface LineHistory {
  openingSpread: number | null
  previousSpread: number | null
  currentSpread: number | null
  spreadMovement: number | null
  openingTotal: number | null
  previousTotal: number | null
  currentTotal: number | null
  totalMovement: number | null
}

/**
 * The normalized record handed to the BSE prediction engine. Real CFBD identity
 * + a DraftKings market (or `available: false` when no confident line exists).
 */
export interface GameWithOdds {
  cfbdId: string
  season: number
  week: number
  kickoff: string
  kickoffTBD: boolean
  neutralSite: boolean
  home: { name: string; abbr: string }
  away: { name: string; abbr: string }
  /** SGO event id backing this line (null when unavailable). Keys line history. */
  sgoEventID: string | null
  market: NormalizedMarket
  lineHistory: LineHistory
  oddsStatus: "matched" | "unavailable"
}

export interface UnmatchedGame {
  cfbdId: string
  matchup: string
  reason: string
}

export interface MatchResult {
  games: GameWithOdds[]
  matchedCount: number
  unmatchedCount: number
  unmatched: UnmatchedGame[]
}

/* -------------------------------- Helpers -------------------------------- */

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

/** Resolve an abbr from a name, with a prefix-based fallback for SGO names. */
function resolveTeam(name: string): string | undefined {
  const direct = resolveAbbr(name)
  if (direct) return direct

  // SGO often appends a mascot ("Ohio State Buckeyes"). Match the longest
  // registry school name that is a prefix of (or equal to) the SGO name.
  const norm = normalize(name)
  let best: { abbr: string; len: number } | undefined
  for (const [abbr, entry] of Object.entries(TEAM_TABLE)) {
    const en = normalize(entry.name)
    if (en.length < 4) continue
    if (norm.startsWith(en) || en.startsWith(norm)) {
      if (!best || en.length > best.len) best = { abbr, len: en.length }
    }
  }
  return best?.abbr
}

function emptyLineHistory(): LineHistory {
  return {
    openingSpread: null,
    previousSpread: null,
    currentSpread: null,
    spreadMovement: null,
    openingTotal: null,
    previousTotal: null,
    currentTotal: null,
    totalMovement: null,
  }
}

/** Seed current line from the live market so history is ready to extend. */
function seedLineHistory(market: NormalizedMarket): LineHistory {
  const h = emptyLineHistory()
  h.currentSpread = market.spread.home
  h.currentTotal = market.total.points
  return h
}

function unavailableMarket(): NormalizedMarket {
  return {
    bookmaker: "draftkings",
    available: false,
    spread: { home: null, away: null, homePrice: null, awayPrice: null },
    moneyline: { home: null, away: null },
    total: { points: null, overPrice: null, underPrice: null, withinPlausibleRange: true },
    sourceOddIDs: { spread: null, moneyline: null, total: null },
    updatedAt: null,
  }
}

/* --------------------------------- Match --------------------------------- */

export function matchOddsToCfbd(
  cfbdGames: CfbdGameLite[],
  sgoEvents: SgoNormalizedEvent[],
): MatchResult {
  // Index SGO events by the unordered team-abbr pair. Keep a list per key so
  // we can disambiguate by kickoff (e.g. home-and-home or neutral sites).
  const index = new Map<string, Array<{ ev: SgoNormalizedEvent; homeAbbr?: string; awayAbbr?: string }>>()

  for (const ev of sgoEvents) {
    const homeAbbr = resolveTeam(ev.homeName)
    const awayAbbr = resolveTeam(ev.awayName)
    if (!homeAbbr || !awayAbbr) continue
    const key = [homeAbbr, awayAbbr].sort().join("|")
    const bucket = index.get(key) ?? []
    bucket.push({ ev, homeAbbr, awayAbbr })
    index.set(key, bucket)
  }

  const games: GameWithOdds[] = []
  const unmatched: UnmatchedGame[] = []

  for (const g of cfbdGames) {
    const homeAbbr = resolveAbbr(g.home.name) ?? g.home.abbr
    const awayAbbr = resolveAbbr(g.away.name) ?? g.away.abbr
    const matchup = `${g.away.name} @ ${g.home.name}`

    const base = {
      cfbdId: g.id,
      season: g.season,
      week: g.week,
      kickoff: g.kickoff,
      kickoffTBD: g.kickoffTBD,
      neutralSite: g.neutralSite,
      home: g.home,
      away: g.away,
    }

    const pushUnavailable = (reason: string) => {
      games.push({
        ...base,
        sgoEventID: null,
        market: unavailableMarket(),
        lineHistory: emptyLineHistory(),
        oddsStatus: "unavailable",
      })
      unmatched.push({ cfbdId: g.id, matchup, reason })
    }

    const key = [homeAbbr, awayAbbr].sort().join("|")
    const candidates = index.get(key)
    if (!candidates || candidates.length === 0) {
      pushUnavailable("no SGO event with matching team pair")
      continue
    }

    // Disambiguate by kickoff proximity.
    const cfbdTime = new Date(g.kickoff).getTime()
    let best: { ev: SgoNormalizedEvent; diffH: number } | undefined
    for (const c of candidates) {
      if (!c.ev.kickoff) continue
      const diffH = Math.abs(new Date(c.ev.kickoff).getTime() - cfbdTime) / 3_600_000
      if (!best || diffH < best.diffH) best = { ev: c.ev, diffH }
    }

    if (!best) {
      pushUnavailable("matched teams but SGO event had no kickoff time")
      continue
    }
    if (Number.isFinite(cfbdTime) && best.diffH > KICKOFF_WINDOW_HOURS) {
      pushUnavailable(
        `kickoff mismatch (${best.diffH.toFixed(1)}h apart, window ${KICKOFF_WINDOW_HOURS}h)`,
      )
      continue
    }
    if (!best.ev.market.available) {
      pushUnavailable("matched game but no DraftKings odds present")
      continue
    }

    games.push({
      ...base,
      sgoEventID: best.ev.eventID || null,
      market: best.ev.market,
      lineHistory: seedLineHistory(best.ev.market),
      oddsStatus: "matched",
    })
  }

  const matchedCount = games.filter((g) => g.oddsStatus === "matched").length
  return {
    games,
    matchedCount,
    unmatchedCount: unmatched.length,
    unmatched,
  }
}
