/**
 * Parlay analysis service.
 *
 * Analyzes a WHOLE ticket rather than naively multiplying sportsbook implied
 * probabilities. Each leg gets its own analysis (market odds, implied prob,
 * BSE true prob, edge, EV, confidence, rating, and a KEEP/REMOVE/REPLACE/AVOID
 * recommendation with a stronger alternative when one exists). Then the ticket
 * is analyzed as a whole with correlation-adjusted joint probability, fair vs
 * offered odds, EV, a weakest/kill leg, and a remove-weakest simulation.
 *
 * All probabilities come from the (currently mock) model via the board layer.
 */

import type {
  BoardSelectionView,
  Game,
  LegAnalysis,
  LegRecommendation,
  ParlayAnalysis,
  ParlayLegRef,
  ParlayVerdict,
} from "./types"
import {
  americanToDecimal,
  clampProb,
  decimalToAmerican,
  evPerUnit,
  impliedProbability,
  parlayDecimal,
  probabilityToAmerican,
} from "./odds"
import {
  bestOffer,
  gameLabel,
  gradeSelection,
  getAllGradedSelections,
  getSelection,
} from "./board"
import {
  adjustedJointProbability,
  correlationMatrix,
  maxAbsCorrelation,
} from "./correlation"

const NOW = "2026-08-18T14:00:00.000Z"

/* ------------------------------------------------------------------ */
/* Per-leg analysis                                                    */
/* ------------------------------------------------------------------ */

function recommendationFor(
  view: BoardSelectionView,
): { rec: LegRecommendation; reason: string } {
  const { rating, evPerUnit: ev, edge, modelConfidence } = view
  if (ev <= -0.06 || rating.tier === "pass") {
    return {
      rec: "AVOID",
      reason:
        ev <= -0.06
          ? "Negative expected value at this price — the book has the edge."
          : "BSE Rating is in the pass tier; no defensible edge here.",
    }
  }
  if (rating.tier === "elite" || (ev > 0.04 && rating.score >= 72)) {
    return { rec: "KEEP", reason: "Positive EV with strong BSE confidence." }
  }
  if (rating.tier === "lean" && ev > 0) {
    return {
      rec: "REPLACE",
      reason:
        modelConfidence < 0.6
          ? "Playable but low model confidence — a stronger leg likely exists."
          : "Marginal value — a higher-rated leg would strengthen the ticket.",
    }
  }
  if (ev <= 0) {
    return {
      rec: "REMOVE",
      reason: "No positive expected value — removing it improves the ticket.",
    }
  }
  return { rec: "KEEP", reason: "Acceptable value and confidence." }
}

/** Find a mathematically stronger swap from the eligible pool (different game). */
function findAlternative(
  view: BoardSelectionView,
  usedGameIds: Set<string>,
): LegAnalysis["alternative"] {
  const pool = getAllGradedSelections()
    .filter(
      ({ game, view: v }) =>
        !usedGameIds.has(game.id) &&
        v.marketType === view.marketType &&
        v.evPerUnit > Math.max(0, view.evPerUnit) &&
        v.rating.score > view.rating.score,
    )
    .sort((a, b) => b.view.rating.score - a.view.rating.score)

  const top = pool[0]
  if (!top) return undefined
  return {
    ref: { gameId: top.game.id, marketType: top.view.marketType, side: top.view.side },
    label: top.view.label,
    gameLabel: gameLabel(top.game),
    ratingScore: top.view.rating.score,
    evPerUnit: top.view.evPerUnit,
  }
}

export function analyzeLeg(
  game: Game,
  view: BoardSelectionView,
  usedGameIds: Set<string>,
): LegAnalysis {
  const selection = game.selections.find((s) => s.id === view.selectionId)!
  const best = bestOffer(selection)
  const decimal = americanToDecimal(best.price)
  const implied = impliedProbability(best.price)
  const trueProb = view.trueProbability
  const { rec, reason } = recommendationFor(view)

  return {
    id: view.selectionId,
    gameId: game.id,
    label: view.label,
    gameLabel: gameLabel(game),
    marketType: view.marketType,
    side: view.side,
    bestBook: best.book,
    americanOdds: best.price,
    decimalOdds: decimal,
    impliedProbability: implied,
    noVigProbability: view.impliedProbability,
    trueProbability: trueProb,
    edge: view.edge,
    probEdge: trueProb - view.impliedProbability,
    evPerUnit: view.evPerUnit,
    modelConfidence: view.modelConfidence,
    rating: view.rating,
    recommendation: rec,
    reason,
    alternative:
      rec === "REPLACE" || rec === "REMOVE" || rec === "AVOID"
        ? findAlternative(view, usedGameIds)
        : undefined,
  }
}

/* ------------------------------------------------------------------ */
/* Whole-ticket analysis                                               */
/* ------------------------------------------------------------------ */

function buildVerdict(
  evPerUnit: number,
  jointProbability: number,
  confidence: number,
  correlationWarning: boolean,
  legCount: number,
): ParlayVerdict {
  if (legCount === 0) {
    return { label: "No legs", tone: "ok", summary: "Add legs to analyze this ticket." }
  }
  if (evPerUnit > 0.05 && confidence >= 60) {
    return {
      label: "Worth betting",
      tone: "good",
      summary:
        "Positive expected value with acceptable confidence and hit probability.",
    }
  }
  if (evPerUnit <= 0) {
    return {
      label: "Not worth it",
      tone: "bad",
      summary:
        "Negative expected value — at these prices the book has the edge. Trim or replace weak legs.",
    }
  }
  if (correlationWarning) {
    return {
      label: "Correlated risk",
      tone: "bad",
      summary:
        "Legs share too much risk; the true hit probability is lower than a naive parlay implies.",
    }
  }
  return {
    label: "Marginal",
    tone: "ok",
    summary:
      "Slight positive value but thin. Consider removing the weakest leg to improve the ticket.",
  }
}

export interface AnalyzeParlayArgs {
  legs: ParlayLegRef[]
  stake: number
}

export function analyzeParlay({ legs, stake }: AnalyzeParlayArgs): ParlayAnalysis {
  const usedGameIds = new Set(legs.map((l) => l.gameId))
  const resolved = legs
    .map((ref) => getSelection(ref.gameId, ref.marketType, ref.side))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))

  const legAnalyses: LegAnalysis[] = resolved.map(({ game, selection }) => {
    const view = gradeSelection(game, selection)
    // Exclude this leg's own game when suggesting an alternative.
    const otherGameIds = new Set(usedGameIds)
    return analyzeLeg(game, view, otherGameIds)
  })

  if (legAnalyses.length === 0) {
    return emptyAnalysis(stake)
  }

  const decimals = legAnalyses.map((l) => l.decimalOdds)
  const trueProbs = legAnalyses.map((l) => l.trueProbability)
  const impliedProbs = legAnalyses.map((l) => l.impliedProbability)

  const correlations = correlationMatrix(legAnalyses)
  const independentJoint = trueProbs.reduce((a, p) => a * p, 1)
  const joint = adjustedJointProbability(trueProbs, correlations)
  const sportsbookImplied = impliedProbs.reduce((a, p) => a * p, 1)

  const offeredDecimal = parlayDecimal(decimals)
  const offeredAmerican = decimalToAmerican(offeredDecimal)
  const fairDecimal = 1 / clampProb(joint)
  const fairAmerican = probabilityToAmerican(joint)

  const ev = evPerUnit(joint, offeredDecimal)
  const payout = stake * offeredDecimal
  const profit = payout - stake
  const evDollars = ev * stake

  const maxCorr = maxAbsCorrelation(correlations)
  const correlationWarning = maxCorr >= 0.5

  const confidence = clampProb(
    0.5 * joint +
      0.3 * (legAnalyses.reduce((a, l) => a + l.modelConfidence, 0) / legAnalyses.length) +
      0.2 * clampProb(0.5 + ev),
  ) * 100

  // Kill leg = lowest true probability. Weakest = removal most improves EV.
  const killLeg = [...legAnalyses].sort((a, b) => a.trueProbability - b.trueProbability)[0]
  const weakest = findWeakestByEv(legAnalyses)

  const ifWeakestRemoved = weakest
    ? simulateRemoval(legAnalyses, weakest.id, stake)
    : null

  return {
    legs: legAnalyses,
    stake,
    independentJointProbability: independentJoint,
    jointProbability: joint,
    sportsbookImpliedProbability: sportsbookImplied,
    offeredDecimal,
    offeredAmerican,
    fairDecimal,
    fairAmerican,
    evPerUnit: ev,
    evDollars,
    payout,
    profit,
    confidence: Math.round(confidence),
    correlations,
    correlationWarning,
    weakestLegId: weakest?.id ?? null,
    killLegId: killLeg?.id ?? null,
    ifWeakestRemoved,
    verdict: buildVerdict(ev, joint, confidence, correlationWarning, legAnalyses.length),
    generatedAt: NOW,
  }
}

/** The leg whose removal most increases ticket EV per unit. */
function findWeakestByEv(legs: LegAnalysis[]): LegAnalysis | null {
  if (legs.length <= 1) return legs[0] ?? null
  let worst: LegAnalysis | null = null
  let bestEvAfter = -Infinity
  for (const leg of legs) {
    const remaining = legs.filter((l) => l.id !== leg.id)
    const dec = parlayDecimal(remaining.map((l) => l.decimalOdds))
    const joint = adjustedJointProbability(
      remaining.map((l) => l.trueProbability),
      correlationMatrix(remaining),
    )
    const evAfter = evPerUnit(joint, dec)
    if (evAfter > bestEvAfter) {
      bestEvAfter = evAfter
      worst = leg
    }
  }
  return worst
}

function simulateRemoval(
  legs: LegAnalysis[],
  removeId: string,
  stake: number,
): ParlayAnalysis["ifWeakestRemoved"] {
  const remaining = legs.filter((l) => l.id !== removeId)
  if (remaining.length === 0) return null
  const dec = parlayDecimal(remaining.map((l) => l.decimalOdds))
  const joint = adjustedJointProbability(
    remaining.map((l) => l.trueProbability),
    correlationMatrix(remaining),
  )
  return {
    jointProbability: joint,
    evPerUnit: evPerUnit(joint, dec),
    offeredAmerican: decimalToAmerican(dec),
    payout: stake * dec,
  }
}

function emptyAnalysis(stake: number): ParlayAnalysis {
  return {
    legs: [],
    stake,
    independentJointProbability: 0,
    jointProbability: 0,
    sportsbookImpliedProbability: 0,
    offeredDecimal: 1,
    offeredAmerican: 0,
    fairDecimal: 1,
    fairAmerican: 0,
    evPerUnit: 0,
    evDollars: 0,
    payout: 0,
    profit: 0,
    confidence: 0,
    correlations: [],
    correlationWarning: false,
    weakestLegId: null,
    killLegId: null,
    ifWeakestRemoved: null,
    verdict: buildVerdict(0, 0, 0, false, 0),
    generatedAt: NOW,
  }
}
