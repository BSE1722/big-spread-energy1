/**
 * Correlation / dependence estimation between parlay legs.
 *
 * Parlay math that blindly multiplies leg probabilities assumes independence.
 * Real legs are often dependent (a game's spread and total move together; a
 * team's spread and moneyline are nearly the same bet). These are transparent
 * heuristic estimates — clearly labeled — that the real model will refine with
 * historical joint outcomes later.
 */

import type { CorrelationPair, LegAnalysis } from "./types"

export interface CorrelationEstimate {
  coefficient: number
  reason: string
}

/** Estimate the correlation coefficient (-1..1) between two legs. */
export function estimateCorrelation(a: LegAnalysis, b: LegAnalysis): CorrelationEstimate {
  if (a.gameId === b.gameId) {
    const types = new Set([a.marketType, b.marketType])

    // Same team's spread and moneyline are almost the same wager.
    if (types.has("spread") && types.has("moneyline")) {
      return {
        coefficient: 0.85,
        reason: "Same game spread and moneyline are nearly the same bet.",
      }
    }
    // Spread + total: a blowout tends to push both, moderately related.
    if (types.has("spread") && types.has("total")) {
      return {
        coefficient: 0.3,
        reason: "Same game spread and total tend to move together.",
      }
    }
    // Moneyline + total, or any other same-game pairing.
    return {
      coefficient: 0.35,
      reason: "Both legs depend on the same game's outcome.",
    }
  }

  // Different games sharing a conference carry a small common-environment link.
  if (
    a.gameId !== b.gameId &&
    sameConference(a, b)
  ) {
    return {
      coefficient: 0.05,
      reason: "Same conference — minor shared environment.",
    }
  }

  return { coefficient: 0, reason: "Independent — different games." }
}

function sameConference(_a: LegAnalysis, _b: LegAnalysis): boolean {
  // Conference is not carried on LegAnalysis today; hook for future data.
  return false
}

/** Build the full pairwise correlation matrix for a set of legs. */
export function correlationMatrix(legs: LegAnalysis[]): CorrelationPair[] {
  const pairs: CorrelationPair[] = []
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const { coefficient, reason } = estimateCorrelation(legs[i], legs[j])
      pairs.push({
        aId: legs[i].id,
        bId: legs[j].id,
        aLabel: legs[i].label,
        bLabel: legs[j].label,
        coefficient,
        reason,
      })
    }
  }
  return pairs
}

/**
 * Correlation-adjusted joint probability.
 *
 * Start from the independent product, then move toward the weakest leg's
 * probability for positive correlation (legs that tend to hit together) or
 * below the independent product for negative correlation. Transparent and
 * intentionally conservative — this is an estimate, not a guarantee.
 */
export function adjustedJointProbability(
  legProbabilities: number[],
  pairs: CorrelationPair[],
): number {
  const independent = legProbabilities.reduce((acc, p) => acc * p, 1)
  if (legProbabilities.length < 2 || pairs.length === 0) return independent

  const avgCorr = pairs.reduce((acc, p) => acc + p.coefficient, 0) / pairs.length
  const minProb = Math.min(...legProbabilities)

  let adjusted: number
  if (avgCorr >= 0) {
    // Toward the min-leg probability as positive correlation grows.
    adjusted = independent + avgCorr * (minProb - independent)
  } else {
    // Negative correlation makes hitting all legs together less likely.
    adjusted = independent * (1 + avgCorr * 0.5)
  }

  return Math.min(minProb, Math.max(independent * 0.5, adjusted))
}

export function maxAbsCorrelation(pairs: CorrelationPair[]): number {
  return pairs.reduce((m, p) => Math.max(m, Math.abs(p.coefficient)), 0)
}
