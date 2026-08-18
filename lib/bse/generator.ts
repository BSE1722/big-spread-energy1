/**
 * Getting Parlaid — BSE's proprietary parlay optimizer.
 *
 * This is NOT a sportsbook parlay builder. It does not randomly stack favorites
 * or pick the highest raw-edge games. It ENUMERATES eligible combinations,
 * scores each whole ticket against an objective (HIGH_HIT_RATE / SWEET_SPOT /
 * MAX_VALUE), and applies hard gates: minimum joint probability, minimum EV,
 * minimum confidence, and a maximum pairwise correlation. It will:
 *   - decide a 2-leg ticket beats a 3-leg ticket,
 *   - refuse to add a leg that raises payout but worsens the ticket,
 *   - and recommend NOTHING when no combination qualifies.
 *
 * The optimization uses the (mock) model outputs via the parlay analyzer.
 */

import type {
  BoardSelectionView,
  Game,
  GeneratedTicket,
  GeneratorResult,
  ObjectiveConfig,
  ParlayAnalysis,
  ParlayLegRef,
  ParlayObjective,
} from "./types"
import { analyzeParlay } from "./parlay"
import { getAllGradedSelections } from "./board"

/* ------------------------------------------------------------------ */
/* Objectives (names configurable; replaces Chalk/Balanced/Longshot)   */
/* ------------------------------------------------------------------ */

export const OBJECTIVES: Record<ParlayObjective, ObjectiveConfig> = {
  HIGH_HIT_RATE: {
    id: "HIGH_HIT_RATE",
    label: "High Hit Rate",
    description:
      "Prioritizes probability and reliability while still requiring acceptable value.",
    minLegs: 2,
    maxLegs: 3,
    minConfidence: 55,
    minEvPerUnit: 0.0,
    minJointProbability: 0.4,
    maxPairwiseCorrelation: 0.4,
  },
  SWEET_SPOT: {
    id: "SWEET_SPOT",
    label: "Sweet Spot",
    description:
      "BSE's flagship: the strongest balance of cash probability, value, confidence, and payout.",
    minLegs: 2,
    maxLegs: 4,
    minConfidence: 50,
    minEvPerUnit: 0.03,
    minJointProbability: 0.22,
    maxPairwiseCorrelation: 0.4,
  },
  MAX_VALUE: {
    id: "MAX_VALUE",
    label: "Max Value",
    description:
      "Accepts more variance when the math justifies it — but still rejects lottery tickets.",
    minLegs: 2,
    maxLegs: 4,
    minConfidence: 42,
    minEvPerUnit: 0.06,
    minJointProbability: 0.12,
    maxPairwiseCorrelation: 0.4,
  },
}

export const OBJECTIVE_ORDER: ParlayObjective[] = [
  "HIGH_HIT_RATE",
  "SWEET_SPOT",
  "MAX_VALUE",
]

/* ------------------------------------------------------------------ */
/* Eligible pool + combination enumeration                             */
/* ------------------------------------------------------------------ */

interface Candidate {
  game: Game
  view: BoardSelectionView
  ref: ParlayLegRef
}

/** Build the eligible leg pool: best-rated positive-EV side per game. */
function eligiblePool(): Candidate[] {
  const byGame = new Map<string, Candidate>()
  for (const { game, view } of getAllGradedSelections()) {
    // Only consider legs with real value and non-pass rating.
    if (view.evPerUnit <= 0 || view.rating.tier === "pass") continue
    const existing = byGame.get(game.id)
    if (!existing || view.rating.score > existing.view.rating.score) {
      byGame.set(game.id, {
        game,
        view,
        ref: { gameId: game.id, marketType: view.marketType, side: view.side },
      })
    }
  }
  return [...byGame.values()].sort((a, b) => b.view.rating.score - a.view.rating.score)
}

/** All k-combinations of an array (k within [min,max]). */
function combinations<T>(items: T[], min: number, max: number): T[][] {
  const out: T[][] = []
  const n = items.length
  const rec = (start: number, combo: T[]) => {
    if (combo.length >= min && combo.length <= max) out.push([...combo])
    if (combo.length === max) return
    for (let i = start; i < n; i++) {
      combo.push(items[i])
      rec(i + 1, combo)
      combo.pop()
    }
  }
  rec(0, [])
  return out.filter((c) => c.length >= min)
}

/* ------------------------------------------------------------------ */
/* Objective scoring                                                   */
/* ------------------------------------------------------------------ */

function scoreTicket(objective: ParlayObjective, a: ParlayAnalysis): number {
  const p = a.jointProbability
  const ev = a.evPerUnit
  const conf = a.confidence / 100
  const payoutPull = Math.min(1, Math.log10(Math.max(1, a.offeredDecimal)) / 1.5)

  switch (objective) {
    case "HIGH_HIT_RATE":
      return 0.6 * p + 0.25 * conf + 0.15 * Math.max(0, ev)
    case "MAX_VALUE":
      return 0.5 * Math.max(0, ev) + 0.25 * payoutPull + 0.15 * p + 0.1 * conf
    case "SWEET_SPOT":
    default:
      // Balanced: reward probability AND value AND confidence together.
      return 0.32 * p + 0.32 * Math.max(0, ev) + 0.22 * conf + 0.14 * payoutPull
  }
}

/** Hard gates — a ticket must clear all of these to qualify. */
function qualifies(cfg: ObjectiveConfig, a: ParlayAnalysis): boolean {
  if (a.legs.length < cfg.minLegs) return false
  if (a.confidence < cfg.minConfidence) return false
  if (a.evPerUnit < cfg.minEvPerUnit) return false
  if (a.jointProbability < cfg.minJointProbability) return false
  const maxCorr = a.correlations.reduce((m, c) => Math.max(m, Math.abs(c.coefficient)), 0)
  if (maxCorr > cfg.maxPairwiseCorrelation) return false
  return true
}

/**
 * Reject a combination when adding legs made the ticket mathematically worse:
 * if any qualifying SUBSET has both higher EV AND higher joint probability,
 * the larger ticket is dominated and should not be recommended.
 */
function isDominatedBySubset(
  analysis: ParlayAnalysis,
  allQualifying: { refIds: string; a: ParlayAnalysis }[],
): boolean {
  const ids = new Set(analysis.legs.map((l) => l.id))
  return allQualifying.some(({ a }) => {
    if (a.legs.length >= analysis.legs.length) return false
    const subsetIds = a.legs.map((l) => l.id)
    const isSubset = subsetIds.every((id) => ids.has(id))
    return (
      isSubset &&
      a.evPerUnit >= analysis.evPerUnit &&
      a.jointProbability > analysis.jointProbability
    )
  })
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface GenerateArgs {
  objective: ParlayObjective
  stake: number
  /** Optional cap the user requested; BSE may return fewer or none. */
  maxLegs?: number
}

export function generateParlay({ objective, stake, maxLegs }: GenerateArgs): GeneratorResult {
  const cfg = OBJECTIVES[objective]
  const upperLegs = Math.min(cfg.maxLegs, maxLegs ?? cfg.maxLegs)
  const pool = eligiblePool().slice(0, 8) // keep enumeration bounded

  if (pool.length < cfg.minLegs) {
    return {
      objective,
      ticket: null,
      evaluatedCombinations: 0,
      message:
        "Not enough qualifying bets on the board to build a defensible ticket. BSE will not manufacture a parlay.",
    }
  }

  const combos = combinations(pool, cfg.minLegs, upperLegs)
  let evaluated = 0

  const qualifying: { combo: Candidate[]; a: ParlayAnalysis; score: number }[] = []
  for (const combo of combos) {
    evaluated++
    const a = analyzeParlay({ legs: combo.map((c) => c.ref), stake })
    if (!qualifies(cfg, a)) continue
    qualifying.push({ combo, a, score: scoreTicket(objective, a) })
  }

  if (qualifying.length === 0) {
    return {
      objective,
      ticket: null,
      evaluatedCombinations: evaluated,
      message:
        "No combination cleared BSE's probability, value, confidence, and correlation thresholds. No ticket recommended.",
    }
  }

  // Drop dominated (over-stacked) tickets, then rank by objective score.
  const qualifyingRefs = qualifying.map((q) => ({
    refIds: q.a.legs.map((l) => l.id).join("|"),
    a: q.a,
  }))
  const surviving = qualifying.filter((q) => !isDominatedBySubset(q.a, qualifyingRefs))
  const ranked = (surviving.length ? surviving : qualifying).sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const ticket: GeneratedTicket = {
    objective,
    analysis: best.a,
    rationale: buildRationale(objective, best.a),
    score: best.score,
  }

  return {
    objective,
    ticket,
    evaluatedCombinations: evaluated,
    message: `Evaluated ${evaluated} combinations and selected the best ${best.a.legs.length}-leg ticket for ${cfg.label}.`,
  }
}

function buildRationale(objective: ParlayObjective, a: ParlayAnalysis): string {
  const cfg = OBJECTIVES[objective]
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`
  const legCount = a.legs.length
  const evText =
    a.evPerUnit > 0 ? `+${(a.evPerUnit * 100).toFixed(1)}% expected value` : "no positive value"

  return `BSE chose this ${legCount}-leg ticket for ${cfg.label} because it offers the best tradeoff of cash probability (${pct(
    a.jointProbability,
  )} estimated joint hit) and ${evText} at ${a.confidence}/100 confidence, without stacking correlated risk. Additional legs were rejected where they raised the payout but lowered the ticket's overall math.`
}

/** Generate a ticket for every objective (used by the Getting Parlaid page). */
export function generateAllObjectives(stake: number): GeneratorResult[] {
  return OBJECTIVE_ORDER.map((objective) => generateParlay({ objective, stake }))
}
