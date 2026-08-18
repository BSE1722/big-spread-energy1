/**
 * BSE model service.
 *
 * IMPORTANT: This does NOT contain a proprietary predictive algorithm and does
 * not invent model accuracy. The proprietary BSE model does not exist yet.
 *
 * What lives here today:
 *  - The math to convert a *fair line* (supplied by mock data now, by the real
 *    model later) into a *fair probability* using a standard normal model of
 *    scoring margins. This is textbook sports-math, not a fabricated edge.
 *  - The PLACEHOLDER factor architecture the real model will eventually fill
 *    (team strength, efficiency, explosiveness, injuries, weather, etc.).
 *
 * Swapping in the real model later means implementing `BseModel.project*` to
 * return real fair lines/probabilities/confidence — no UI or type changes.
 */

import type {
  League,
  MarketSide,
  MarketType,
  ModelFactor,
  ModelProjection,
} from "./types"
import { getLeagueConfig } from "./leagues"
import { clampProb } from "./odds"

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 approximation). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2)
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return x >= 0 ? 1 - p : p
}

/**
 * Probability that a selection covers, given favorable-signed points of edge.
 * edge = (points the bettor gets at market) - (points BSE says is fair).
 * With a margin std dev of sigma, cover prob = Φ(edge / sigma).
 */
export function coverProbabilityFromEdge(
  edge: number,
  league: League,
  marketType: MarketType,
): number {
  const cfg = getLeagueConfig(league)
  const sigma = marketType === "total" ? cfg.totalStdDev : cfg.marginStdDev
  return clampProb(normalCdf(edge / sigma))
}

/**
 * Win probability for a moneyline side, derived from the fair margin (points
 * BSE expects that side to win by; negative = expected to lose).
 */
export function moneylineProbability(fairMargin: number, league: League): number {
  const cfg = getLeagueConfig(league)
  return clampProb(normalCdf(fairMargin / cfg.marginStdDev))
}

/**
 * The full set of inputs the proprietary model will eventually weigh. All are
 * PLACEHOLDERS today: unavailable and contributing nothing. This is the
 * architecture; the values are intentionally not invented.
 */
export const MODEL_FACTORS: Omit<ModelFactor, "contribution">[] = [
  { key: "team_strength", label: "Team strength", weight: 0.16, available: false },
  { key: "opp_adjusted", label: "Opponent-adjusted performance", weight: 0.12, available: false },
  { key: "off_efficiency", label: "Offensive efficiency", weight: 0.09, available: false },
  { key: "def_efficiency", label: "Defensive efficiency", weight: 0.09, available: false },
  { key: "explosiveness", label: "Explosiveness", weight: 0.06, available: false },
  { key: "success_rate", label: "Success rate", weight: 0.06, available: false },
  { key: "finishing_drives", label: "Finishing drives", weight: 0.05, available: false },
  { key: "turnovers", label: "Turnover margin", weight: 0.05, available: false },
  { key: "special_teams", label: "Special teams", weight: 0.04, available: false },
  { key: "pace", label: "Pace", weight: 0.04, available: false },
  { key: "home_field", label: "Home-field advantage", weight: 0.05, available: false },
  { key: "injuries", label: "Injuries & availability", weight: 0.06, available: false },
  { key: "weather", label: "Weather", weight: 0.03, available: false },
  { key: "rest_travel", label: "Rest & travel", weight: 0.03, available: false },
  { key: "coaching", label: "Coaching tendencies", weight: 0.03, available: false },
  { key: "matchup", label: "Matchup characteristics", weight: 0.04, available: false },
  { key: "market_movement", label: "Market movement", weight: 0.05, available: false },
]

/** Placeholder factor list with zeroed contributions (nothing invented). */
export function placeholderFactors(): ModelFactor[] {
  return MODEL_FACTORS.map((f) => ({ ...f, contribution: 0 }))
}

export interface ProjectSelectionArgs {
  league: League
  marketType: MarketType
  side: MarketSide
  /** BSE fair line for this side (from mock data now, real model later). */
  fairLine: number
  /** Consensus market line for this side. */
  marketLine: number
  /** Fair margin from the home team's perspective (for moneyline). */
  fairHomeMargin?: number
  /** Model self-confidence (0-1), a placeholder supplied by the data layer. */
  confidence: number
  generatedAt: string
}

export interface BseModel {
  id: string
  version: string
  /** True while no proprietary predictive algorithm is wired in. */
  isPlaceholder: boolean
  projectSelection(args: ProjectSelectionArgs): ModelProjection
  edgeFor(args: Pick<ProjectSelectionArgs, "marketType" | "side" | "fairLine" | "marketLine">): number
}

/** Favorable-signed edge for a selection. Positive = value for the bettor. */
function computeEdge(
  marketType: MarketType,
  side: MarketSide,
  fairLine: number,
  marketLine: number,
): number {
  if (marketType === "total") {
    // Over wants fair total above market; under wants fair total below market.
    return side === "over" ? fairLine - marketLine : marketLine - fairLine
  }
  if (marketType === "spread") {
    // marketLine and fairLine are signed for the side; more points = better.
    return marketLine - fairLine
  }
  return 0 // moneyline edge is expressed via probability, not points
}

/**
 * The current model implementation. It trusts the fair line handed to it and
 * derives a fair probability with the normal-margin math above. Confidence
 * and factor contributions are placeholders.
 */
export function createMockModel(): BseModel {
  return {
    id: "bse-mock",
    version: "0.1.0-placeholder",
    isPlaceholder: true,
    edgeFor: ({ marketType, side, fairLine, marketLine }) =>
      computeEdge(marketType, side, fairLine, marketLine),
    projectSelection(args): ModelProjection {
      const { league, marketType, side, fairLine, marketLine, fairHomeMargin } = args
      const edge = computeEdge(marketType, side, fairLine, marketLine)

      let fairProbability: number
      if (marketType === "moneyline") {
        const margin = fairHomeMargin ?? 0
        const homeProb = moneylineProbability(margin, league)
        fairProbability = side === "home" ? homeProb : 1 - homeProb
      } else {
        fairProbability = coverProbabilityFromEdge(edge, league, marketType)
      }

      return {
        fairLine,
        fairProbability: clampProb(fairProbability),
        confidence: args.confidence,
        factors: placeholderFactors(),
        source: "bse-model",
        generatedAt: args.generatedAt,
      }
    },
  }
}

/** The default model instance used across the app. */
export const bseModel = createMockModel()
