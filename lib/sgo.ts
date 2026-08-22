/**
 * SportsGameOdds (SGO) server-side client + normalizer.
 *
 * - League: NCAAF. Bookmaker: DraftKings only.
 * - Auth: `x-api-key: process.env.SGO_API` (never exposed to the client).
 * - CFBD remains the source of truth for schedules/identity; this module only
 *   provides market lines to be matched against CFBD games elsewhere.
 * - MANUAL-ONLY: this client is invoked exclusively by the admin refresh job.
 *   There is no timed revalidation and no visitor-triggered pull; the frozen
 *   result is persisted in the durable odds snapshot (see lib/odds-snapshot).
 *
 * SGO odds model: an event's `odds` map is keyed by
 *   `{statID}-{statEntityID}-{periodID}-{betTypeID}-{sideID}`
 * where betTypeID ∈ { sp (spread), ml (moneyline), ou (total) } and
 * sideID ∈ { home, away, over, under }. Each odd carries per-book values under
 * `byBookmaker.draftkings` ({ odds, spread, overUnder, available, lastUpdatedAt }).
 */

const SGO_BASE_URL = "https://api.sportsgameodds.com/v2"
const BOOKMAKER = "draftkings" as const

/**
 * @deprecated Odds are no longer time-cached. Refreshes are manual-only and the
 * result is frozen in the durable snapshot. Retained only for compatibility.
 */
export const ODDS_CACHE_SECONDS = 0

/*
 * Strict market selection.
 *
 * SGO encodes every market as `oddID = statID-statEntityID-periodID-betTypeID-sideID`.
 * The ONLY markets we accept as the standard full-game DraftKings lines are:
 *   - total    : points-all-game-ou-over / points-all-game-ou-under
 *   - spread   : points-home-game-sp-home / points-away-game-sp-away
 *   - moneyline: points-home-game-ml-home / points-away-game-ml-away
 *
 * Requiring periodID === "game" excludes first-half/quarter/period markets;
 * requiring statID === "points" excludes yardage/other stats; requiring
 * statEntityID === "all" for totals excludes team totals; and player props are
 * excluded because their statEntityID is a playerID (not all/home/away).
 */
const FULL_GAME_PERIOD = "game"
const GAME_POINTS_STAT = "points"
const TEAM_SIDES = new Set(["home", "away"])

/**
 * Configurable plausible range for a full-game NCAAF total. Totals outside this
 * band are FLAGGED for review (not silently dropped or replaced). Override via
 * ODDS_TOTAL_MIN / ODDS_TOTAL_MAX. Safety check only — never a guess source.
 */
export const TOTAL_MIN = Number(process.env.ODDS_TOTAL_MIN ?? 25)
export const TOTAL_MAX = Number(process.env.ODDS_TOTAL_MAX ?? 100)

/** Parsed SGO oddID segments. statEntityID may contain hyphens (playerIDs). */
export interface OddSegments {
  statID: string
  statEntityID: string
  periodID: string
  betTypeID: string
  sideID: string
}

/**
 * Parse an SGO oddID into its 5 segments, reading fixed segments from BOTH ends
 * so a hyphenated statEntityID (e.g. a playerID) does not shift the fields.
 */
export function parseOddID(oddID: string): OddSegments | null {
  if (typeof oddID !== "string") return null
  const parts = oddID.split("-")
  if (parts.length < 5) return null
  const sideID = parts[parts.length - 1]
  const betTypeID = parts[parts.length - 2]
  const periodID = parts[parts.length - 3]
  const statID = parts[0]
  const statEntityID = parts.slice(1, parts.length - 3).join("-")
  return { statID, statEntityID, periodID, betTypeID, sideID }
}

/** True only for the standard full-game, points-based main line of a bet type. */
export function isFullGameMainLine(seg: OddSegments): boolean {
  if (seg.periodID !== FULL_GAME_PERIOD) return false
  if (seg.statID !== GAME_POINTS_STAT) return false
  if (seg.betTypeID === "ou") return seg.statEntityID === "all" && (seg.sideID === "over" || seg.sideID === "under")
  if (seg.betTypeID === "sp" || seg.betTypeID === "ml") {
    return TEAM_SIDES.has(seg.statEntityID) && seg.sideID === seg.statEntityID
  }
  return false
}

/* ------------------------------- Raw types ------------------------------- */

interface SgoByBookmaker {
  odds?: string | number
  spread?: string | number
  overUnder?: string | number
  available?: boolean
  lastUpdatedAt?: string
}

interface SgoOdd {
  oddID?: string
  betTypeID?: string
  sideID?: string
  byBookmaker?: Record<string, SgoByBookmaker>
}

export interface SgoEvent {
  eventID?: string
  leagueID?: string
  teams?: {
    home?: { names?: { long?: string; medium?: string; short?: string }; teamID?: string }
    away?: { names?: { long?: string; medium?: string; short?: string }; teamID?: string }
  }
  status?: { startsAt?: string; displayShort?: string }
  odds?: Record<string, SgoOdd>
  [key: string]: unknown
}

/* ----------------------------- Normalized shape --------------------------- */

/**
 * One bookmaker side price + line, normalized to numbers.
 * `line` is the spread (home-relative) or total number; null when unavailable.
 */
export interface NormalizedMarket {
  bookmaker: "draftkings"
  available: boolean
  /** Home-relative spread, e.g. -6.5 means home favored by 6.5. */
  spread: {
    home: number | null
    away: number | null
    homePrice: number | null
    awayPrice: number | null
  }
  moneyline: {
    home: number | null
    away: number | null
  }
  total: {
    points: number | null
    overPrice: number | null
    underPrice: number | null
    /**
     * false = the total fell outside the plausible NCAAF range and is FLAGGED
     * for review. Consumers (BSE) should treat a flagged total as unavailable
     * rather than trusting it. null total is considered in-range (nothing to flag).
     */
    withinPlausibleRange: boolean
  }
  /** Exact SGO oddIDs selected per market, for traceability/auditing. */
  sourceOddIDs: {
    spread: string | null
    moneyline: string | null
    total: string | null
  }
  /** Most recent bookmaker update across the parsed markets (ISO), if any. */
  updatedAt: string | null
}

/** Raw SGO event reduced to just what we need to match + normalize. */
export interface SgoNormalizedEvent {
  eventID: string
  homeName: string
  awayName: string
  kickoff: string | null
  market: NormalizedMarket
}

/* -------------------------------- Helpers -------------------------------- */

function toNum(v: string | number | undefined | null): number | null {
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function teamName(side?: { names?: { long?: string; medium?: string; short?: string }; teamID?: string }): string {
  return (
    side?.names?.long ??
    side?.names?.medium ??
    side?.names?.short ??
    side?.teamID ??
    ""
  ).trim()
}

function emptyMarket(): NormalizedMarket {
  return {
    bookmaker: BOOKMAKER,
    available: false,
    spread: { home: null, away: null, homePrice: null, awayPrice: null },
    moneyline: { home: null, away: null },
    total: { points: null, overPrice: null, underPrice: null, withinPlausibleRange: true },
    sourceOddIDs: { spread: null, moneyline: null, total: null },
    updatedAt: null,
  }
}

/**
 * Extract the standard full-game DraftKings spread/moneyline/total from an
 * SGO event. Selection is strict: only oddIDs that pass `isFullGameMainLine`
 * are considered, so team totals, alternate lines, halves/quarters, and player
 * props are all rejected instead of being mistaken for the game line.
 */
function normalizeMarket(event: SgoEvent): NormalizedMarket {
  const market = emptyMarket()
  const odds = event.odds
  if (!odds || typeof odds !== "object") return market

  const updatedAts: string[] = []

  for (const [key, odd] of Object.entries(odds)) {
    const dk = odd?.byBookmaker?.[BOOKMAKER]
    if (!dk) continue

    // Authoritative: parse the oddID and require an exact full-game main line.
    const oddID = odd.oddID ?? key
    const seg = parseOddID(oddID)
    if (!seg || !isFullGameMainLine(seg)) continue

    const price = toNum(dk.odds)
    if (dk.lastUpdatedAt) updatedAts.push(dk.lastUpdatedAt)

    if (seg.betTypeID === "sp") {
      const spread = toNum(dk.spread)
      if (seg.sideID === "home") {
        market.spread.home = spread
        market.spread.homePrice = price
        market.sourceOddIDs.spread = oddID
      } else {
        market.spread.away = spread
        market.spread.awayPrice = price
      }
    } else if (seg.betTypeID === "ml") {
      if (seg.sideID === "home") {
        market.moneyline.home = price
        market.sourceOddIDs.moneyline = oddID
      } else {
        market.moneyline.away = price
      }
    } else if (seg.betTypeID === "ou") {
      const points = toNum(dk.overUnder)
      if (points != null) market.total.points = points
      if (seg.sideID === "over") {
        market.total.overPrice = price
        market.sourceOddIDs.total = oddID
      } else {
        market.total.underPrice = price
      }
    }
  }

  // Backfill the opposite spread side if only one was quoted.
  if (market.spread.home != null && market.spread.away == null) {
    market.spread.away = -market.spread.home
  } else if (market.spread.away != null && market.spread.home == null) {
    market.spread.home = -market.spread.away
  }

  // Sanity validator: flag (do not drop/replace) an implausible full-game total.
  const points = market.total.points
  market.total.withinPlausibleRange = points == null ? true : points >= TOTAL_MIN && points <= TOTAL_MAX

  market.available =
    market.spread.home != null ||
    market.moneyline.home != null ||
    market.moneyline.away != null ||
    market.total.points != null

  if (updatedAts.length) {
    market.updatedAt = updatedAts.sort().at(-1) ?? null
  }

  return market
}

/* --------------------------------- Fetch --------------------------------- */

/**
 * Fetch NCAAF events (with DraftKings odds) from SGO, following pagination.
 * Cached at the data layer so concurrent visitors share one upstream call.
 */
export async function fetchSgoNcaafEvents(options?: {
  limitPerPage?: number
  maxPages?: number
}): Promise<SgoEvent[]> {
  const apiKey = process.env.SGO_API
  if (!apiKey) throw new Error("SGO_API is not configured")

  const limit = options?.limitPerPage ?? 100
  const maxPages = options?.maxPages ?? 4

  const all: SgoEvent[] = []
  let cursor: string | undefined

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      leagueID: "NCAAF",
      bookmakerID: BOOKMAKER,
      oddsAvailable: "true",
      limit: String(limit),
    })
    if (cursor) params.set("cursor", cursor)

    // MANUAL-ONLY: no timed revalidation. This fetch runs only during an
    // admin-triggered refresh, so we always pull fresh and never cache at the
    // data layer (the frozen result lives in the durable snapshot instead).
    const res = await fetch(`${SGO_BASE_URL}/events?${params.toString()}`, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      cache: "no-store",
    })

    if (!res.ok) {
      throw new Error(`SGO events request failed: ${res.status} ${res.statusText}`)
    }

    const payload = await res.json()
    const data: SgoEvent[] = Array.isArray(payload?.data) ? payload.data : []
    all.push(...data)

    cursor = payload?.nextCursor ?? undefined
    if (!cursor || data.length === 0) break
  }

  return all
}

/** Reduce a single raw SGO event to the normalized, matchable shape. */
export function normalizeSgoEvent(ev: SgoEvent): SgoNormalizedEvent {
  return {
    eventID: ev.eventID ?? "",
    homeName: teamName(ev.teams?.home),
    awayName: teamName(ev.teams?.away),
    kickoff: ev.status?.startsAt ?? null,
    market: normalizeMarket(ev),
  }
}

/** Fetch + normalize NCAAF DraftKings odds into a clean, matchable list. */
export async function getSgoNormalizedEvents(): Promise<SgoNormalizedEvent[]> {
  const events = await fetchSgoNcaafEvents()
  return events.map(normalizeSgoEvent)
}

/**
 * Diagnostic: list every DraftKings odd on a raw event with its parsed oddID
 * segments and whether it qualifies as a full-game main line. Lets us audit the
 * raw market structure and confirm derivative markets are excluded.
 */
export function debugDkOddIDs(ev: SgoEvent) {
  const out: Array<{
    oddID: string
    segments: OddSegments | null
    fullGameMainLine: boolean
    dk: { odds: string | number | null; spread: string | number | null; overUnder: string | number | null }
  }> = []
  const odds = ev.odds
  if (!odds || typeof odds !== "object") return out
  for (const [key, odd] of Object.entries(odds)) {
    const dk = odd?.byBookmaker?.[BOOKMAKER]
    if (!dk) continue
    const oddID = odd.oddID ?? key
    const seg = parseOddID(oddID)
    out.push({
      oddID,
      segments: seg,
      fullGameMainLine: seg ? isFullGameMainLine(seg) : false,
      dk: { odds: dk.odds ?? null, spread: dk.spread ?? null, overUnder: dk.overUnder ?? null },
    })
  }
  return out
}
