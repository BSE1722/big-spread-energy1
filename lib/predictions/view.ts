import type { Prediction, PredictionCorrection } from "@/lib/predictions/service"

/**
 * Plain, client-safe view models for a published pick. Server components map
 * DB rows through these so we never pass Date objects or internal-only columns
 * (there are none secret here, but this keeps the client payload explicit).
 */

export interface PredictionView {
  id: string
  season: number
  week: number
  matchup: string
  homeTeam: string
  awayTeam: string
  market: string
  marketLabel: string
  pickLabel: string
  lineValue: number | null
  priceAmerican: number | null
  book: string
  publishedAtIso: string
  kickoffIso: string
  status: string
  grade: string | null
  homeScore: number | null
  awayScore: number | null
  scoreLabel: string | null
  unitsDelta: number | null
  modelVersion: string
  modelIsPlaceholder: boolean
  lockHashShort: string
  hasCorrection: boolean
  corrections: CorrectionView[]
}

export interface CorrectionView {
  field: string
  originalValue: string | null
  correctedValue: string | null
  reason: string
  createdAtIso: string
}

const MARKET_LABELS: Record<string, string> = {
  spread: "Spread",
  total: "Total",
  moneyline: "Moneyline",
}

export function toPredictionView(
  p: Prediction,
  corrections: PredictionCorrection[] = [],
): PredictionView {
  const scoreLabel =
    p.homeScore != null && p.awayScore != null ? `${p.awayScore}-${p.homeScore}` : null

  return {
    id: p.id,
    season: p.season,
    week: p.week,
    matchup: `${p.awayTeam} @ ${p.homeTeam}`,
    homeTeam: p.homeTeam,
    awayTeam: p.awayTeam,
    market: p.market,
    marketLabel: MARKET_LABELS[p.market] ?? p.market,
    pickLabel: p.pickLabel,
    lineValue: p.lineValue,
    priceAmerican: p.priceAmerican,
    book: p.book,
    publishedAtIso: p.publishedAt instanceof Date ? p.publishedAt.toISOString() : String(p.publishedAt),
    kickoffIso: p.kickoff instanceof Date ? p.kickoff.toISOString() : String(p.kickoff),
    status: p.status,
    grade: p.grade,
    homeScore: p.homeScore,
    awayScore: p.awayScore,
    scoreLabel,
    unitsDelta: p.unitsDelta,
    modelVersion: p.modelVersion,
    modelIsPlaceholder: p.modelIsPlaceholder,
    lockHashShort: p.lockHash.slice(0, 12),
    hasCorrection: p.hasCorrection,
    corrections: corrections
      .filter((c) => c.predictionId === p.id)
      .map((c) => ({
        field: c.field,
        originalValue: c.originalValue,
        correctedValue: c.correctedValue,
        reason: c.reason,
        createdAtIso: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      })),
  }
}

/** Format American odds for display: +150 / -110. */
export function formatAmerican(price: number | null): string {
  if (price == null) return "—"
  return price > 0 ? `+${price}` : `${price}`
}

/** Format a units delta: +0.91u / -1.00u / 0.00u. */
export function formatUnits(units: number | null): string {
  if (units == null) return "—"
  const sign = units > 0 ? "+" : ""
  return `${sign}${units.toFixed(2)}u`
}
