/**
 * Flat, UI-friendly view of every eligible board selection a user can add to a
 * parlay in the Analyzer. Derived from the board layer so it stays in sync.
 */

import type { ParlayLegRef } from "./types"
import { bestOffer, gameLabel, getBoard } from "./board"
import { formatAmerican } from "./odds"

export interface PoolLeg {
  ref: ParlayLegRef
  id: string
  gameId: string
  gameLabel: string
  label: string
  marketType: ParlayLegRef["marketType"]
  odds: number
  oddsLabel: string
  ratingScore: number
  edge: number
  evPerUnit: number
}

export function getParlayPool(): PoolLeg[] {
  const out: PoolLeg[] = []
  for (const row of getBoard()) {
    for (const view of row.selections) {
      // Skip clearly dead legs (no value) to keep the picker focused.
      if (view.rating.tier === "pass" && view.evPerUnit <= 0) continue
      const sel = row.game.selections.find((s) => s.id === view.selectionId)!
      const best = bestOffer(sel)
      out.push({
        ref: { gameId: row.game.id, marketType: view.marketType, side: view.side },
        id: view.selectionId,
        gameId: row.game.id,
        gameLabel: gameLabel(row.game),
        label: view.label,
        marketType: view.marketType,
        odds: best.price,
        oddsLabel: formatAmerican(best.price),
        ratingScore: view.rating.score,
        edge: Number(view.edge.toFixed(1)),
        evPerUnit: view.evPerUnit,
      })
    }
  }
  // Highest-rated first for a sensible default order.
  return out.sort((a, b) => b.ratingScore - a.ratingScore)
}
