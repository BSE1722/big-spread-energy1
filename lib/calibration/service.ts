import "server-only"

import { db } from "@/lib/db"
import { reviewLegs } from "@/lib/db/schema"

/**
 * READ-ONLY confidence-calibration report over the frozen Postgame Review legs.
 *
 * HONESTY RULES (see the review schema header):
 *   - Uses ONLY the real, pregame-captured `bseRating` (never null, never a
 *     later recalculation). Unrated legs are counted and excluded, never
 *     back-filled.
 *   - The distribution histogram is a DISPLAY grouping of observed ratings, not
 *     a performance bucket and not a model claim.
 *   - Win-rate-by-rating and correlation are reported ONLY once enough DECISIVE
 *     (win/loss) graded rated legs exist; below the threshold the report says
 *     "insufficient observations" and derives nothing.
 *   - This module NEVER writes, normalizes, or fabricates a rating.
 */

/** Minimum decisive graded+rated legs before any win-rate/correlation is shown. */
export const MIN_OBSERVATIONS = 25

export interface CalibrationBin {
  label: string
  min: number
  max: number
  count: number
}

export interface RatingWinRateBin {
  label: string
  min: number
  max: number
  graded: number
  wins: number
  losses: number
  pushes: number
  /** Wins / (wins + losses); null when no decisive legs in this band. */
  winRate: number | null
}

export interface CalibrationReport {
  totalLegs: number
  ratedLegs: number
  unratedLegs: number
  gradedRatedLegs: number
  decisiveGradedRatedLegs: number
  summary: { avg: number | null; median: number | null; min: number | null; max: number | null }
  distribution: CalibrationBin[]
  winRateByRating: RatingWinRateBin[] | null
  correlation: number | null
  sufficient: boolean
  minObservations: number
  generatedAt: string
}

/** Ten fixed display bands across the 0–100 rating range. */
const BANDS: Array<{ min: number; max: number }> = Array.from({ length: 10 }, (_, i) => ({
  min: i * 10 + (i === 0 ? 0 : 1),
  max: i * 10 + 10,
}))

function bandLabel(b: { min: number; max: number }): string {
  return `${b.min}\u2013${b.max}`
}

function bandIndexFor(rating: number): number {
  // rating 0 → band 0; 100 → band 9; otherwise ceil to the 10-wide band.
  const idx = Math.ceil(rating / 10) - 1
  return Math.min(9, Math.max(0, idx))
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Pearson correlation between rating and a decisive win(1)/loss(0) outcome. */
function pearson(pairs: Array<{ x: number; y: number }>): number | null {
  const n = pairs.length
  if (n < 2) return null
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const { x, y } of pairs) {
    sx += x
    sy += y
    sxx += x * x
    syy += y * y
    sxy += x * y
  }
  const numerator = n * sxy - sx * sy
  const denominator = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  if (denominator === 0) return null
  return numerator / denominator
}

export async function getCalibrationReport(): Promise<CalibrationReport> {
  const legs = await db
    .select({ bseRating: reviewLegs.bseRating, status: reviewLegs.status, grade: reviewLegs.grade })
    .from(reviewLegs)

  const totalLegs = legs.length
  const rated = legs.filter((l) => l.bseRating != null) as Array<{ bseRating: number; status: string; grade: string | null }>
  const ratedLegs = rated.length

  const ratingValues = rated.map((l) => l.bseRating).sort((a, b) => a - b)
  const avg = ratingValues.length ? ratingValues.reduce((s, v) => s + v, 0) / ratingValues.length : null
  const summary = {
    avg,
    median: median(ratingValues),
    min: ratingValues.length ? ratingValues[0] : null,
    max: ratingValues.length ? ratingValues[ratingValues.length - 1] : null,
  }

  const distribution: CalibrationBin[] = BANDS.map((b) => ({ label: bandLabel(b), min: b.min, max: b.max, count: 0 }))
  for (const l of rated) distribution[bandIndexFor(l.bseRating)].count += 1

  // Decisive graded rated legs drive win-rate + correlation.
  const gradedRated = rated.filter((l) => l.status === "graded" && (l.grade === "win" || l.grade === "loss" || l.grade === "push"))
  const decisive = gradedRated.filter((l) => l.grade === "win" || l.grade === "loss")
  const gradedRatedLegs = gradedRated.length
  const decisiveGradedRatedLegs = decisive.length
  const sufficient = decisiveGradedRatedLegs >= MIN_OBSERVATIONS

  let winRateByRating: RatingWinRateBin[] | null = null
  let correlation: number | null = null
  if (sufficient) {
    const bins: RatingWinRateBin[] = BANDS.map((b) => ({
      label: bandLabel(b),
      min: b.min,
      max: b.max,
      graded: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      winRate: null,
    }))
    for (const l of gradedRated) {
      const bin = bins[bandIndexFor(l.bseRating)]
      bin.graded += 1
      if (l.grade === "win") bin.wins += 1
      else if (l.grade === "loss") bin.losses += 1
      else if (l.grade === "push") bin.pushes += 1
    }
    for (const bin of bins) {
      const decisiveInBin = bin.wins + bin.losses
      bin.winRate = decisiveInBin > 0 ? bin.wins / decisiveInBin : null
    }
    winRateByRating = bins
    correlation = pearson(decisive.map((l) => ({ x: l.bseRating, y: l.grade === "win" ? 1 : 0 })))
  }

  return {
    totalLegs,
    ratedLegs,
    unratedLegs: totalLegs - ratedLegs,
    gradedRatedLegs,
    decisiveGradedRatedLegs,
    summary,
    distribution,
    winRateByRating,
    correlation,
    sufficient,
    minObservations: MIN_OBSERVATIONS,
    generatedAt: new Date().toISOString(),
  }
}
