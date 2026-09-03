/**
 * GETTING PARLAID — TICKET GENERATION STAGE
 * =========================================
 *
 * This is the previously-missing stage that turns per-game BSE spread reads
 * into parlay tickets. It is PURE arithmetic over data that already exists on
 * /api/cfbd-board (which sources bse_board_signal + the frozen DraftKings
 * snapshot). It does NOT:
 *   - touch or retrain the frozen `B_residual::gbt` model (nTrees=52),
 *   - change the >= 1-point spread-edge threshold (imported from price-aware),
 *   - fabricate ratings, odds, edges, EV, or win probabilities,
 *   - require Official Publish & Lock picks.
 *
 * Every leg it emits is graded through the EXISTING `evaluateBet` decision
 * layer (lib/bse/price-aware) — the same engine the interactive analyzer uses —
 * so eligibility here is identical to the rest of the app. A leg is eligible
 * only when its line edge clears the frozen gate AND a real DraftKings price
 * exists to combine. Each leg carries the exact audit trail (game id, fair
 * spread, offered spread + price, bookmaker, snapshot timestamp) back to the
 * bse_board_signal row and DK snapshot it came from.
 */

import {
  evaluateBet,
  summarizeParlay,
  selectBestRung,
  combineAmericanPrices,
  LINE_EDGE_GATE,
  type BetSide,
  type BetClassification,
  type PriceTier,
  type ParlaySummary,
  type LadderRung,
  type LineSource,
} from "@/lib/bse/price-aware"

/**
 * Structural subset of a /api/cfbd-board game the generator needs. LiveBoardGame
 * satisfies this, so the client passes board games directly with no mapping.
 */
export interface GeneratorGame {
  id: string
  week: number
  kickoff: string
  kickoffTBD?: boolean
  away: { name: string; abbr: string }
  home: { name: string; abbr: string }
  marketSpread: number | null
  marketSpreadPrice?: { home: number | null; away: number | null }
  fairSpread: number | null
  edgeSpread: number | null
  bseRating: number | null
  oddsStatus?: "matched" | "unavailable"
  odds?: {
    bookmaker?: string
    sgoEventID?: string | null
    updatedAt?: string | null
  }
}

/** Per-game BSE read, used by BOTH the slate badge and the ticket generator. */
export interface GameRead {
  gameId: string
  matchup: string
  kickoff: string
  /** True when the frozen model produced a spread read for this game. */
  hasProjection: boolean
  side: BetSide | null
  pickedTeamName: string | null
  pickedTeamAbbr: string | null
  /** Team-facing spread being backed (away = -homeSpread). */
  pickedSpread: number | null
  offeredHomeSpread: number | null
  fairHomeSpread: number | null
  price: number | null
  /** Points better than the BSE fair line for the backed side. */
  lineEdge: number | null
  classification: BetClassification | null
  priceTier: PriceTier | null
  rating: number | null
  /** Clears the frozen line-edge gate AND has a real price to combine. */
  eligible: boolean
  /** ---- line-shopping recommendation (ladder-ready; see recommendLine) ---- */
  /** Provenance of the evaluated number. Board legs are always LIVE_DK. */
  source: LineSource
  /** True when only the DK main line was available (no alternate rungs to shop). */
  mainLineOnly: boolean
  /** Which line BSE recommends taking after shopping the available ladder. */
  recommendation: "STAY_AT_MAIN" | "BUY_ALTERNATE" | null
  /** Plain-English explanation of the recommendation. */
  recommendationText: string | null
  /** ---- audit trail: traceable to the bse_board_signal row + DK snapshot ---- */
  bookmaker: string | null
  snapshotAt: string | null
  sgoEventID: string | null
}

/**
 * Grade a single game exactly as the rest of the app does. Chooses the BSE
 * value side from the sign of the model edge (positive edge => home is the
 * value side; see lib/bse/model-signal.leanFromEdge) and runs it through the
 * shared price-aware `evaluateBet`. Always returns a read (never throws), with
 * hasProjection=false when the model has no scored signal for this game.
 */
export function evaluateGame(g: GeneratorGame): GameRead {
  const matchup = `${g.away.name} @ ${g.home.name}`
  const base = {
    gameId: g.id,
    matchup,
    kickoff: g.kickoff,
    bookmaker: g.odds?.bookmaker ?? (g.oddsStatus === "matched" ? "draftkings" : null),
    snapshotAt: g.odds?.updatedAt ?? null,
    sgoEventID: g.odds?.sgoEventID ?? null,
  }

  const hasProjection =
    g.edgeSpread != null &&
    Number.isFinite(g.edgeSpread) &&
    g.fairSpread != null &&
    Number.isFinite(g.fairSpread)

  if (!hasProjection) {
    return {
      ...base,
      hasProjection: false,
      side: null,
      pickedTeamName: null,
      pickedTeamAbbr: null,
      pickedSpread: null,
      offeredHomeSpread: g.marketSpread,
      fairHomeSpread: g.fairSpread,
      price: null,
      lineEdge: null,
      classification: null,
      priceTier: null,
      rating: g.bseRating,
      eligible: false,
      source: "LIVE_DK",
      mainLineOnly: true,
      recommendation: null,
      recommendationText: null,
    }
  }

  // Positive edge => home is the value side; negative => away. This mirrors
  // leanFromEdge and guarantees the backed side has the positive line edge.
  const side: BetSide = (g.edgeSpread as number) >= 0 ? "home" : "away"
  const offeredHomeSpread = g.marketSpread
  const price =
    side === "home" ? (g.marketSpreadPrice?.home ?? null) : (g.marketSpreadPrice?.away ?? null)

  // Grade against the CURRENT DraftKings line via the shared decision layer.
  const ev = evaluateBet({
    fairHomeSpread: g.fairSpread,
    offeredHomeSpread,
    price,
    side,
  })

  const eligible = ev.lineEdge != null && ev.lineEdge >= LINE_EDGE_GATE && price != null

  // Shop the available DraftKings ladder for this side. Today the feed gives us
  // only the main line (SGO audit: no alternate rungs on our tier), so the
  // ladder has one rung and selectBestRung reports mainLineOnly — but the moment
  // alternate ingestion lands, `ladderRungsFor` is the ONLY place to extend and
  // this shops the whole ladder with no other change.
  const ladder = ladderRungsFor(g, side, offeredHomeSpread, price)
  const selection = selectBestRung(g.fairSpread, ladder, side)
  const bestSpread = selection.best?.offeredHomeSpread ?? null
  const recommendation: GameRead["recommendation"] =
    selection.mainLineOnly || bestSpread == null || bestSpread === offeredHomeSpread
      ? "STAY_AT_MAIN"
      : "BUY_ALTERNATE"
  const recommendationText = selection.mainLineOnly
    ? "No DraftKings alternate spreads are available from our odds feed, so BSE evaluates the main line."
    : recommendation === "STAY_AT_MAIN"
      ? "Main line is the best value on the ladder — buying extra points isn't worth the added juice."
      : `Best value on the DK ladder: ${bestSpread! < 0 ? bestSpread : `+${bestSpread}`} (home-relative).`

  return {
    ...base,
    hasProjection: true,
    side,
    pickedTeamName: side === "home" ? g.home.name : g.away.name,
    pickedTeamAbbr: side === "home" ? g.home.abbr : g.away.abbr,
    pickedSpread: ev.pickedSpread,
    offeredHomeSpread,
    fairHomeSpread: g.fairSpread,
    price,
    lineEdge: ev.lineEdge,
    classification: ev.classification,
    priceTier: ev.priceTier,
    rating: g.bseRating,
    eligible,
    source: "LIVE_DK",
    mainLineOnly: selection.mainLineOnly,
    recommendation,
    recommendationText,
  }
}

/**
 * The real DraftKings rungs available to shop for one side of a game. Currently
 * only the main line is ingested (see lib/sgo.ts — the client requests main-line
 * oddIDs only, and our SGO tier does not expose a full-game alternate ladder for
 * DraftKings), so this returns a single rung. This is the ONE seam to extend
 * when alternate-ladder ingestion is added; nothing else in the generator needs
 * to change for ladder shopping to activate. It NEVER fabricates rungs.
 */
function ladderRungsFor(
  _g: GeneratorGame,
  _side: BetSide,
  offeredHomeSpread: number | null,
  price: number | null,
): LadderRung[] {
  if (offeredHomeSpread == null) return []
  return [{ homeSpread: offeredHomeSpread, price }]
}

/** Every game's read, in kickoff order. Drives the slate badges. */
export function readGames(games: GeneratorGame[]): GameRead[] {
  return games
    .map(evaluateGame)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
}

/** Only the eligible legs (one per game — a game yields at most one read). */
export function buildCandidates(games: GeneratorGame[]): GameRead[] {
  return games.map(evaluateGame).filter((r) => r.eligible)
}

/* ------------------------------- risk profiles ---------------------------- */

export type RiskProfileId = "safer" | "balanced" | "longshot"

export interface RiskProfileDef {
  id: RiskProfileId
  label: string
  /** Longest ticket this profile will build. */
  maxLegs: number
  /** Fewest legs required to emit a ticket (a parlay needs >= 2). */
  minLegs: number
  /** Whether GOOD_LINE_EXPENSIVE (favorable line, pricey juice) legs are allowed. */
  allowExpensive: boolean
}

/**
 * The three ticket types the UI already advertises. Selection differences are
 * deliberately transparent: leg count and whether an expensively-priced (but
 * still edge-clearing) leg is permitted. No profile changes the edge gate.
 */
export const RISK_PROFILES: RiskProfileDef[] = [
  { id: "safer", label: "Highest Edge", maxLegs: 3, minLegs: 2, allowExpensive: false },
  { id: "balanced", label: "Balanced", maxLegs: 4, minLegs: 2, allowExpensive: true },
  { id: "longshot", label: "Long Shot", maxLegs: 6, minLegs: 2, allowExpensive: true },
]

function tierRank(t: PriceTier | null): number {
  return t === "reasonable" ? 0 : t === "expensive" ? 1 : t === "prohibitive" ? 2 : 3
}

/** Best legs first: most line edge, then cheapest price, then rating, then kickoff. */
function sortCandidates(a: GameRead, b: GameRead): number {
  const edge = (b.lineEdge ?? 0) - (a.lineEdge ?? 0)
  if (edge !== 0) return edge
  const tier = tierRank(a.priceTier) - tierRank(b.priceTier)
  if (tier !== 0) return tier
  const rating = (b.rating ?? 0) - (a.rating ?? 0)
  if (rating !== 0) return rating
  const kickoff = new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  if (kickoff !== 0) return kickoff
  return a.gameId.localeCompare(b.gameId)
}

/* --------------------------------- tickets -------------------------------- */

export interface GeneratedTicket {
  profile: RiskProfileId
  label: string
  legs: GameRead[]
  legCount: number
  totalLineEdge: number
  summary: ParlaySummary
  /**
   * Combined DraftKings parlay price from the REAL per-leg American prices.
   * Null unless every leg has a price. This is the market price (juice), NOT an
   * EV or win-probability claim.
   */
  combinedDecimal: number | null
  combinedAmerican: number | null
}

export interface ProfileResult {
  profile: RiskProfileId
  label: string
  ticket: GeneratedTicket | null
  /** Why no ticket was built, when ticket is null. */
  reason: string | null
}

function buildTicket(def: RiskProfileDef, candidates: GameRead[]): ProfileResult {
  const pool = candidates.filter((c) =>
    def.allowExpensive ? true : c.classification === "STRONG_LINE_PRICE_OK",
  )
  const legs = [...pool].sort(sortCandidates).slice(0, def.maxLegs)

  if (legs.length < def.minLegs) {
    const kind = def.allowExpensive ? "eligible" : "reasonably priced"
    return {
      profile: def.id,
      label: def.label,
      ticket: null,
      reason: `Only ${legs.length} ${kind} leg${legs.length === 1 ? "" : "s"} this week — need at least ${def.minLegs}. BSE declines rather than force a bet.`,
    }
  }

  const summary = summarizeParlay(legs.map((l) => ({ classification: l.classification!, lineEdge: l.lineEdge })))
  const combined = combineAmericanPrices(legs.map((l) => l.price))

  return {
    profile: def.id,
    label: def.label,
    ticket: {
      profile: def.id,
      label: def.label,
      legs,
      legCount: legs.length,
      totalLineEdge: summary.totalLineEdge,
      summary,
      combinedDecimal: combined?.decimal ?? null,
      combinedAmerican: combined?.american ?? null,
    },
    reason: null,
  }
}

export interface GenerateResult {
  reads: GameRead[]
  candidates: GameRead[]
  results: ProfileResult[]
}

/**
 * Full generation pass over a board slate: read every game, collect eligible
 * candidate legs, and build one ticket per risk profile (or a decline reason).
 * One leg per game is inherent — each game contributes at most one candidate.
 */
export function generateAllTickets(games: GeneratorGame[]): GenerateResult {
  const reads = readGames(games)
  const candidates = reads.filter((r) => r.eligible)
  const results = RISK_PROFILES.map((def) => buildTicket(def, candidates))
  return { reads, candidates, results }
}
