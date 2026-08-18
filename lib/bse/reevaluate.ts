/**
 * Line-change re-evaluation architecture.
 *
 * When live odds/lines eventually update, BSE must recompute affected game
 * edges, ratings, Parlay Analyzer results, and Getting Parlaid recommendations.
 * A ticket recommended at 9:00 AM should NOT stay recommended if the price is
 * meaningfully worse by noon.
 *
 * These are pure functions over "before" and "after" snapshots so a future
 * live feed can drive them without touching the UI. No live data is invented.
 */

import type {
  BoardSelectionView,
  GameReevaluation,
  ParlayAnalysis,
  TicketReevaluation,
} from "./types"

/** Compare a graded selection before/after a line change. */
export function reevaluateSelection(
  gameId: string,
  before: BoardSelectionView,
  after: BoardSelectionView,
): GameReevaluation {
  const ratingDelta = after.rating.score - before.rating.score
  const edgeDelta = after.edge - before.edge
  const changed = Math.abs(ratingDelta) >= 1 || Math.abs(edgeDelta) >= 0.25

  let note = "No material change."
  if (changed) {
    if (ratingDelta < 0) note = "Line moved against the edge — rating downgraded."
    else if (ratingDelta > 0) note = "Line moved toward value — rating upgraded."
    else note = "Edge shifted with the market."
  }

  return {
    gameId,
    changed,
    previousRating: before.rating.score,
    newRating: after.rating.score,
    previousEdge: before.edge,
    newEdge: after.edge,
    note,
  }
}

/**
 * Decide whether a previously-recommended ticket still holds after re-pricing.
 * The threshold for "stale" is a meaningful EV drop or crossing into negative EV.
 */
export function reevaluateTicket(
  before: ParlayAnalysis,
  after: ParlayAnalysis,
): TicketReevaluation {
  const evDrop = before.evPerUnit - after.evPerUnit
  const wentNegative = before.evPerUnit > 0 && after.evPerUnit <= 0
  const bigDrop = evDrop >= 0.03
  const stale = wentNegative || bigDrop
  const stillRecommended = !stale && after.evPerUnit > 0

  let note: string
  if (wentNegative) {
    note = "Price moved enough that the ticket is no longer +EV. Recommendation withdrawn."
  } else if (bigDrop) {
    note = "Expected value dropped materially since this ticket was generated. Re-check before betting."
  } else if (after.evPerUnit > before.evPerUnit) {
    note = "Line moved in your favor since generation — value improved."
  } else {
    note = "Still within recommended range."
  }

  return {
    stillRecommended,
    previousEvPerUnit: before.evPerUnit,
    newEvPerUnit: after.evPerUnit,
    previousOfferedAmerican: before.offeredAmerican,
    newOfferedAmerican: after.offeredAmerican,
    stale,
    note,
  }
}

/** Freshness helper for the UI: how old is a recommendation snapshot? */
export function isStaleByTime(generatedAt: string, now: Date, maxAgeMinutes = 180): boolean {
  const then = new Date(generatedAt).getTime()
  const ageMin = (now.getTime() - then) / 60000
  return ageMin > maxAgeMinutes
}
