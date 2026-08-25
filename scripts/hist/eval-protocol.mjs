// ---------------------------------------------------------------------------
// FROZEN Phase-4 evaluation protocol (model-agnostic scoring only).
//
// This module trains NOTHING and selects NO model. Phase 5 supplies, per test
// game, a predicted_home_margin; these functions score it against the frozen
// market and label using the exact locked rules below. Freezing the scorer now
// guarantees Phase 5 cannot (even accidentally) tune the metric to the result.
//
// SIGN CONVENTIONS (validated in 05-audit.mjs against real data):
//   actual_margin              = home_points - away_points
//   market_implied_home_margin = -market_spread   (home favored => spread<0 => positive)
//   HOME covers ATS  iff actual_margin >  market_implied_home_margin
//   AWAY covers ATS  iff actual_margin <  market_implied_home_margin
//   PUSH             iff actual_margin == market_implied_home_margin
//   predicted_edge   = predicted_home_margin - market_implied_home_margin
//   The model bets HOME when predicted_edge > 0, AWAY when predicted_edge < 0.
//   => a bet WINS iff sign(predicted_edge) == sign(actual_margin - market_implied_home_margin)
// ---------------------------------------------------------------------------

export const EDGE_THRESHOLDS = [1, 2, 3, 4, 5, 7]

const finite = (x) => typeof x === "number" && Number.isFinite(x)

/** Margin-accuracy metrics for an array of {predicted_home_margin, actual_margin}. */
export function marginMetrics(records) {
  const errs = []
  for (const r of records) {
    if (finite(r.predicted_home_margin) && finite(r.actual_margin)) {
      errs.push(r.predicted_home_margin - r.actual_margin)
    }
  }
  const n = errs.length
  if (n === 0) return { n: 0, mae: null, rmse: null, bias: null }
  return {
    n,
    mae: errs.reduce((a, b) => a + Math.abs(b), 0) / n,
    rmse: Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / n),
    bias: errs.reduce((a, b) => a + b, 0) / n,
  }
}

/**
 * Bet-selection performance at a fixed absolute edge threshold.
 * records: [{ predicted_home_margin, market_implied_home_margin, actual_margin }]
 * Returns qualifying counts, ATS W/L/push, and win% (pushes excluded).
 */
export function atsAtThreshold(records, threshold) {
  let qualifying = 0
  let wins = 0
  let losses = 0
  let pushes = 0
  for (const r of records) {
    if (!finite(r.predicted_home_margin) || !finite(r.market_implied_home_margin) || !finite(r.actual_margin)) continue
    const edge = r.predicted_home_margin - r.market_implied_home_margin
    if (Math.abs(edge) < threshold) continue
    qualifying++
    const realized = r.actual_margin - r.market_implied_home_margin // >0 home covers
    if (realized === 0) {
      pushes++
    } else if (Math.sign(edge) === Math.sign(realized)) {
      wins++
    } else {
      losses++
    }
  }
  const decided = wins + losses
  return {
    threshold,
    qualifying,
    wins,
    losses,
    pushes,
    winPct: decided ? Math.round((1000 * wins) / decided) / 10 : null,
    // Flat-stakes units at standard -110 juice (win +0.909, loss -1). Reported
    // for context only; breakeven ATS win rate at -110 is ~52.38%.
    unitsAt110: Math.round((wins * 0.909 - losses) * 100) / 100,
  }
}

/** Full bet-selection sweep across the frozen thresholds. */
export function atsSweep(records) {
  return EDGE_THRESHOLDS.map((t) => atsAtThreshold(records, t))
}

/** Market-improvement summary: model MAE vs market MAE on the same rows. */
export function improvementOverMarket(records) {
  const model = marginMetrics(records)
  const market = marginMetrics(
    records.map((r) => ({ predicted_home_margin: r.market_implied_home_margin, actual_margin: r.actual_margin })),
  )
  return {
    modelMae: model.mae,
    marketMae: market.mae,
    maeImprovement: model.mae != null && market.mae != null ? market.mae - model.mae : null,
    modelRmse: model.rmse,
    marketRmse: market.rmse,
    n: model.n,
  }
}
