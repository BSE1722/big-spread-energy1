/**
 * BSE Rating: a 0-100 composite confidence/value score.
 *
 * Deliberately NOT equal to raw spread edge. A large gap between the BSE fair
 * line and the market line will NOT produce a high rating on its own — weak
 * model confidence and high uncertainty hold the score down. The weights and
 * thresholds below are transparent placeholders, tuned to feel reasonable, and
 * are the seams where the real model's calibration will plug in.
 */

import type { BseRating, BseRatingInput, RatingTier } from "./types"

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function tierFor(score: number): RatingTier {
  if (score >= 85) return "elite"
  if (score >= 70) return "strong"
  if (score >= 55) return "lean"
  return "pass"
}

/** Normalization ceilings — the point at which a component is "maxed out". */
const NORM = {
  edgePoints: 6, // 6+ points of edge = full marks
  probabilityAdvantage: 0.1, // +10% true vs no-vig = full marks
  evPerUnit: 0.15, // +15% EV = full marks
}

const WEIGHTS = {
  edge: 0.28,
  prob: 0.28,
  ev: 0.22,
  marketQuality: 0.12,
  lineAgreement: 0.1,
}

export function computeBseRating(input: BseRatingInput): BseRating {
  const edgeScore = clamp01(input.edgePoints / NORM.edgePoints)
  const probScore = clamp01(input.probabilityAdvantage / NORM.probabilityAdvantage)
  const evScore = clamp01(input.evPerUnit / NORM.evPerUnit)
  const marketQuality = clamp01(input.marketQuality)
  const lineAgreement = clamp01(input.lineAgreement)
  const confidence = clamp01(input.modelConfidence)
  const uncertainty = clamp01(input.uncertainty)

  const base =
    WEIGHTS.edge * edgeScore +
    WEIGHTS.prob * probScore +
    WEIGHTS.ev * evScore +
    WEIGHTS.marketQuality * marketQuality +
    WEIGHTS.lineAgreement * lineAgreement

  // Confidence multiplier: a strong edge with weak confidence is capped.
  const confidenceFactor = 0.55 + 0.45 * confidence
  // Uncertainty penalty: injuries / thin data pull the score down.
  const uncertaintyFactor = 1 - 0.4 * uncertainty

  const composite = clamp01(base * confidenceFactor * uncertaintyFactor)

  // Map the 0-1 composite onto a 35-98 display band so scores read naturally.
  const score = Math.round(35 + 63 * composite)
  const clampedScore = Math.min(98, Math.max(1, score))

  // Flag when confidence is what held an otherwise-big edge back.
  const confidenceCapped = confidence < 0.6 && edgeScore > 0.6

  return {
    score: clampedScore,
    tier: tierFor(clampedScore),
    components: {
      edge: edgeScore,
      probability: probScore,
      ev: evScore,
      marketQuality,
      lineAgreement,
      confidence,
      uncertainty,
    },
    confidenceCapped,
  }
}

export function ratingTierLabel(tier: RatingTier): string {
  switch (tier) {
    case "elite":
      return "Elite"
    case "strong":
      return "Strong"
    case "lean":
      return "Lean"
    default:
      return "Pass"
  }
}
