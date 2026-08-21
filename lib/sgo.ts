/**
 * SportsGameOdds (SGO) server-side client + normalizer.
 *
 * - League: NCAAF. Bookmaker: DraftKings only.
 * - Auth: `x-api-key: process.env.SGO_API` (never exposed to the client).
 * - CFBD remains the source of truth for schedules/identity; this module only
 *   provides market lines to be matched against CFBD games elsewhere.
 * - Odds are cached at the data layer (Next fetch `revalidate`) so visitors
 *   share one cached response instead of each triggering a new upstream call.
 *
 * SGO odds model: an event's `odds` map is keyed by
 *   `{statID}-{statEntityID}-{periodID}-{betTypeID}-{sideID}`
 * where betTypeID ∈ { sp (spread), ml (moneyline), ou (total) } and
 * sideID ∈ { home, away, over, under }. Each odd carries per-book values under
 * `byBookmaker.draftkings` ({ odds, spread, overUnder, available, lastUpdatedAt }).
 */

const SGO_BASE_URL = "https://api.sportsgameodds.com/v2"
const BOOKMAKER = "draftkings" as const

/** How long a cached odds pull stays fresh (seconds). Tune in one place. */
export const ODDS_CACHE_SECONDS = 300

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
    total: { points: null, overPrice: null, underPrice: null },
    updatedAt: null,
  }
}

/** Extract DraftKings spread/moneyline/total from an SGO event's odds map. */
function normalizeMarket(event: SgoEvent): NormalizedMarket {
  const market = emptyMarket()
  const odds = event.odds
  if (!odds || typeof odds !== "object") return market

  const updatedAts: string[] = []

  for (const odd of Object.values(odds)) {
    const dk = odd?.byBookmaker?.[BOOKMAKER]
    if (!dk) continue

    // Determine bet type + side (prefer explicit fields, else parse oddID).
    let betType = odd.betTypeID
    let side = odd.sideID
    if ((!betType || !side) && typeof odd.oddID === "string") {
      const parts = odd.oddID.split("-")
      side = side ?? parts[parts.length - 1]
      betType = betType ?? parts[parts.length - 2]
    }

    const price = toNum(dk.odds)
    if (dk.lastUpdatedAt) updatedAts.push(dk.lastUpdatedAt)

    if (betType === "sp") {
      const spread = toNum(dk.spread)
      if (side === "home") {
        market.spread.home = spread
        market.spread.homePrice = price
      } else if (side === "away") {
        market.spread.away = spread
        market.spread.awayPrice = price
      }
    } else if (betType === "ml") {
      if (side === "home") market.moneyline.home = price
      else if (side === "away") market.moneyline.away = price
    } else if (betType === "ou") {
      const points = toNum(dk.overUnder)
      if (points != null) market.total.points = points
      if (side === "over") market.total.overPrice = price
      else if (side === "under") market.total.underPrice = price
    }
  }

  // Backfill the opposite spread side if only one was quoted.
  if (market.spread.home != null && market.spread.away == null) {
    market.spread.away = -market.spread.home
  } else if (market.spread.away != null && market.spread.home == null) {
    market.spread.home = -market.spread.away
  }

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

    const res = await fetch(`${SGO_BASE_URL}/events?${params.toString()}`, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      next: { revalidate: ODDS_CACHE_SECONDS },
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

/** Fetch + normalize NCAAF DraftKings odds into a clean, matchable list. */
export async function getSgoNormalizedEvents(): Promise<SgoNormalizedEvent[]> {
  const events = await fetchSgoNcaafEvents()
  return events.map((ev) => ({
    eventID: ev.eventID ?? "",
    homeName: teamName(ev.teams?.home),
    awayName: teamName(ev.teams?.away),
    kickoff: ev.status?.startsAt ?? null,
    market: normalizeMarket(ev),
  }))
}
