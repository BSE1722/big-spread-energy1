/**
 * BSE domain types.
 *
 * This is the single source of truth for every game, market, price, model
 * projection, rating, and parlay object in the application. The UI never
 * hard-codes these values — it reads them through the service layer.
 *
 * The shapes below are deliberately provider-agnostic so the current MOCK
 * data can later be swapped for a live sportsbook odds API, historical data,
 * and the proprietary BSE model WITHOUT changing the UI or these contracts.
 */

/* ------------------------------------------------------------------ */
/* Sport / league scaffolding (multi-sport ready, CFB is current focus) */
/* ------------------------------------------------------------------ */

export type Sport = "football"

/** College football is the current focus; NFL is scaffolded, not yet active. */
export type League = "ncaaf" | "nfl"

export interface LeagueConfig {
  league: League
  sport: Sport
  displayName: string
  /** Std dev of final scoring margin — used to convert a fair line to a probability. */
  marginStdDev: number
  /** Std dev of final combined score — used for totals probabilities. */
  totalStdDev: number
  /** Neutral-site-adjusted home field value in points. */
  homeFieldAdvantage: number
  /** Whether BSE currently serves this league. */
  active: boolean
}

/* ------------------------------------------------------------------ */
/* Teams & games                                                       */
/* ------------------------------------------------------------------ */

export type GameStatus = "scheduled" | "live" | "final"

export interface Team {
  id: string
  league: League
  name: string
  abbr: string
  rank?: number
  record?: string
  conference?: string
}

export type MarketType = "spread" | "total" | "moneyline"
export type MarketSide = "home" | "away" | "over" | "under"

export type Sportsbook =
  | "consensus"
  | "draftkings"
  | "fanduel"
  | "betmgm"
  | "caesars"
  | "espnbet"

/** Where a value originated. Everything is "mock" until live feeds are wired. */
export type DataSource = "mock" | "odds-api" | "bse-model" | "historical"

/** A single point-in-time snapshot of a line/price (for opening & movement history). */
export interface LineSnapshot {
  line: number
  price: number
  timestamp: string
}

/** One sportsbook's offer for a specific selection (side of a market). */
export interface BookOffer {
  book: Sportsbook
  /** Signed number for THIS side (e.g. +2.5, -6.5, total 51.5, 0 for moneyline). */
  line: number
  /** American price for THIS side. */
  price: number
  opening: LineSnapshot
  lastUpdated: string
}

/* ------------------------------------------------------------------ */
/* BSE model outputs (architecture + placeholders — not yet predictive) */
/* ------------------------------------------------------------------ */

/**
 * A single input the proprietary model will eventually weigh. For now these
 * are PLACEHOLDERS: `available: false` and `contribution: 0`. No fabricated
 * model outputs are invented here.
 */
export interface ModelFactor {
  key: string
  label: string
  weight: number
  contribution: number
  available: boolean
}

export interface ModelProjection {
  /** BSE fair line for this selection's market (e.g. fair spread for the side). */
  fairLine: number
  /** BSE estimated TRUE probability this selection wins/covers (0-1). */
  fairProbability: number
  /** Model self-reported confidence (0-1). Placeholder until the model exists. */
  confidence: number
  /** Placeholder factor contributions — architecture for the real model. */
  factors: ModelFactor[]
  source: DataSource
  generatedAt: string
}

/**
 * A market selection for a single game: one (marketType, side), priced across
 * multiple sportsbooks, with a BSE projection and derived analytics attached.
 */
export interface MarketSelection {
  id: string
  gameId: string
  marketType: MarketType
  side: MarketSide
  /** Human label, e.g. "Georgia +2.5" or "Over 58.5". */
  label: string
  offers: BookOffer[]
  projection: ModelProjection
  source: DataSource
  lastUpdated: string
}

export interface Game {
  id: string
  sport: Sport
  league: League
  season: number
  week: number
  /** ISO kickoff timestamp. */
  kickoff: string
  network?: string
  status: GameStatus
  home: Team
  away: Team
  selections: MarketSelection[]
  dataSource: DataSource
  lastUpdated: string
  /** Always true today. Guarantees mock data is clearly identifiable. */
  isMock: boolean
}

/* ------------------------------------------------------------------ */
/* BSE Rating (0-100 composite — NOT raw edge)                         */
/* ------------------------------------------------------------------ */

export interface BseRatingInput {
  /** Points of edge (favorable-signed) between market line and BSE fair line. */
  edgePoints: number
  /** trueProbability - no-vig implied probability. */
  probabilityAdvantage: number
  /** Expected value per unit staked. */
  evPerUnit: number
  /** Model self-confidence (0-1). Low confidence caps the score. */
  modelConfidence: number
  /** Quality of the market (book count / consensus tightness), 0-1. */
  marketQuality: number
  /** How well line movement agrees with the model, 0-1. */
  lineAgreement: number
  /** Injury / data uncertainty penalty, 0-1 (higher = more uncertain). */
  uncertainty: number
}

export type RatingTier = "elite" | "strong" | "lean" | "pass"

export interface BseRating {
  /** 0-100 composite confidence/value score. */
  score: number
  tier: RatingTier
  /** Normalized 0-1 component scores, for transparency. */
  components: Record<string, number>
  /** True when weak model confidence held the score down despite a big edge. */
  confidenceCapped: boolean
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

export interface BoardSelectionView {
  selectionId: string
  marketType: MarketType
  side: MarketSide
  label: string
  /** Consensus market line for the side. */
  marketLine: number
  /** BSE fair line for the side. */
  fairLine: number
  /** Favorable-signed points of edge. */
  edge: number
  bestBook: Sportsbook
  bestPrice: number
  impliedProbability: number
  trueProbability: number
  evPerUnit: number
  rating: BseRating
  /** current line - opening line (points). */
  lineMovement: number
  modelConfidence: number
}

export interface BoardRow {
  gameId: string
  game: Game
  /** BSE's headline selection for this game (highest-rated market side). */
  primary: BoardSelectionView
  /** All graded selections for the game (spread + total + moneyline sides). */
  selections: BoardSelectionView[]
}

/* ------------------------------------------------------------------ */
/* Parlays                                                             */
/* ------------------------------------------------------------------ */

export interface ParlayLegRef {
  gameId: string
  marketType: MarketType
  side: MarketSide
  book?: Sportsbook
}

export type LegRecommendation = "KEEP" | "REMOVE" | "REPLACE" | "AVOID"

export interface LegAnalysis {
  id: string
  gameId: string
  label: string
  gameLabel: string
  marketType: MarketType
  side: MarketSide
  bestBook: Sportsbook
  americanOdds: number
  decimalOdds: number
  impliedProbability: number
  noVigProbability: number
  trueProbability: number
  edge: number
  probEdge: number
  evPerUnit: number
  modelConfidence: number
  rating: BseRating
  recommendation: LegRecommendation
  reason: string
  /** A mathematically stronger swap from the eligible pool, when one exists. */
  alternative?: {
    ref: ParlayLegRef
    label: string
    gameLabel: string
    ratingScore: number
    evPerUnit: number
  }
}

export interface CorrelationPair {
  aId: string
  bId: string
  aLabel: string
  bLabel: string
  coefficient: number
  reason: string
}

export type ParlayVerdictTone = "good" | "ok" | "bad"

export interface ParlayVerdict {
  label: string
  tone: ParlayVerdictTone
  summary: string
}

export interface ParlayAnalysis {
  legs: LegAnalysis[]
  stake: number
  /** Naive product of true probabilities, assuming independence. */
  independentJointProbability: number
  /** Correlation-adjusted estimated joint hit probability. */
  jointProbability: number
  /** Sportsbook implied probability of the parlay (with vig). */
  sportsbookImpliedProbability: number
  offeredDecimal: number
  offeredAmerican: number
  fairDecimal: number
  fairAmerican: number
  evPerUnit: number
  evDollars: number
  payout: number
  profit: number
  /** Overall confidence in the ticket, 0-100. */
  confidence: number
  correlations: CorrelationPair[]
  correlationWarning: boolean
  /** Leg whose removal most improves expected value. */
  weakestLegId: string | null
  /** Leg most likely to kill the ticket (lowest true probability). */
  killLegId: string | null
  ifWeakestRemoved: {
    jointProbability: number
    evPerUnit: number
    offeredAmerican: number
    payout: number
  } | null
  verdict: ParlayVerdict
  generatedAt: string
}

/* ------------------------------------------------------------------ */
/* Getting Parlaid (optimizer)                                         */
/* ------------------------------------------------------------------ */

/**
 * BSE objectives. These names are configurable. They replace the old
 * "Chalk / Balanced / Longshot" framing with probability-and-value-aware goals.
 */
export type ParlayObjective = "HIGH_HIT_RATE" | "SWEET_SPOT" | "MAX_VALUE"

export interface ObjectiveConfig {
  id: ParlayObjective
  label: string
  description: string
  minLegs: number
  maxLegs: number
  /** Minimum overall confidence (0-100) required to recommend. */
  minConfidence: number
  /** Minimum EV per unit required to recommend. */
  minEvPerUnit: number
  /** Minimum estimated joint hit probability required to recommend. */
  minJointProbability: number
  /** Reject combinations with any pairwise correlation above this. */
  maxPairwiseCorrelation: number
}

export interface GeneratedTicket {
  objective: ParlayObjective
  analysis: ParlayAnalysis
  rationale: string
  /** Objective-specific optimization score used to rank combinations. */
  score: number
}

export interface GeneratorResult {
  objective: ParlayObjective
  ticket: GeneratedTicket | null
  evaluatedCombinations: number
  /** Explains the result, including when BSE refuses to recommend a ticket. */
  message: string
}

/* ------------------------------------------------------------------ */
/* Line-change re-evaluation                                           */
/* ------------------------------------------------------------------ */

export interface GameReevaluation {
  gameId: string
  changed: boolean
  previousRating: number
  newRating: number
  previousEdge: number
  newEdge: number
  note: string
}

export interface TicketReevaluation {
  stillRecommended: boolean
  previousEvPerUnit: number
  newEvPerUnit: number
  previousOfferedAmerican: number
  newOfferedAmerican: number
  stale: boolean
  note: string
}

/* ------------------------------------------------------------------ */
/* Access tiers (free vs BSE Pro — architecture only, no payments)     */
/* ------------------------------------------------------------------ */

export type Tier = "free" | "pro"

export interface Entitlements {
  /** Max board rows visible (null = unlimited). */
  boardRowLimit: number | null
  /** Max legs allowed in the Parlay Analyzer (null = unlimited). */
  parlayAnalyzerLegLimit: number | null
  /** Max Getting Parlaid generations (null = unlimited). */
  parlayGenerations: number | null
  gettingParlaid: boolean
  lineMovement: boolean
  bestLineComparison: boolean
  alerts: boolean
  fullRatings: boolean
  modelBreakdown: boolean
}
