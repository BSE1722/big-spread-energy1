"use client"

/**
 * React hooks over the BSE service layer.
 *
 * Components consume these instead of calling services directly. Today the data
 * is synchronous mock data, so the hooks memoize pure computations. When a live
 * odds API arrives, these hooks become the single place to add fetching/SWR and
 * live re-evaluation — component code stays the same.
 */

import { useMemo } from "react"
import type {
  BoardRow,
  Entitlements,
  GeneratorResult,
  ParlayAnalysis,
  ParlayLegRef,
  ParlayObjective,
  Tier,
} from "./types"
import { getBoard, getGames } from "./board"
import { analyzeParlay } from "./parlay"
import { generateAllObjectives, generateParlay } from "./generator"
import { getCurrentTier, getEntitlements } from "./tiers"
import { CURRENT_CONTEXT, MOCK_DATA_LABEL } from "./mock-data"

export function useBoard(): { rows: BoardRow[]; label: string; context: typeof CURRENT_CONTEXT } {
  const rows = useMemo(() => getBoard(), [])
  return { rows, label: MOCK_DATA_LABEL, context: CURRENT_CONTEXT }
}

export function useGames() {
  return useMemo(() => getGames(), [])
}

export function useParlayAnalysis(legs: ParlayLegRef[], stake: number): ParlayAnalysis {
  const key = legs.map((l) => `${l.gameId}:${l.marketType}:${l.side}`).join(",")
  return useMemo(
    () => analyzeParlay({ legs, stake }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, stake],
  )
}

export function useGeneratedParlay(
  objective: ParlayObjective,
  stake: number,
  nonce = 0,
): GeneratorResult {
  return useMemo(
    () => generateParlay({ objective, stake }),
    [objective, stake, nonce],
  )
}

export function useAllGeneratedParlays(stake: number, nonce = 0): GeneratorResult[] {
  return useMemo(() => generateAllObjectives(stake), [stake, nonce])
}

export function useEntitlements(tier?: Tier): { tier: Tier; entitlements: Entitlements } {
  const resolved = tier ?? getCurrentTier()
  const entitlements = useMemo(() => getEntitlements(resolved), [resolved])
  return { tier: resolved, entitlements }
}
