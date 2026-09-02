import "server-only"

import { pool } from "@/lib/db"
import { getFrozenCandidate } from "@/lib/shadow/service"
import { buildBoardSignal, type BoardSignal } from "@/lib/bse/model-signal"

/**
 * READ-ONLY access to the customer Board's frozen-model display cache
 * (bse_board_signal). Returns the per-game signal for the active frozen
 * candidate, keyed by CFBD game id (e.g. "cfbd-12345").
 *
 * Prediction fields only — this path NEVER touches bse_shadow_grade, so no
 * ATS/CLV/validation result can leak onto a customer surface.
 */

export interface BoardSignalMeta {
  modelHash: string
  threshold: number
  /** How many games in the requested week have a model read. */
  count: number
}

export interface BoardSignalResult {
  meta: BoardSignalMeta | null
  /** cfbdGameId -> BoardSignal. Empty when no candidate/rows exist. */
  byGameId: Map<string, BoardSignal>
}

/**
 * Load the frozen-model signal for every scored game in a season/week.
 * Returns an empty map (never throws for missing data) so the Board degrades
 * gracefully to "— / No rating" when the weekly scoring job hasn't run.
 *
 * `week` is the RAW PROVIDER week (as stored in bse_board_signal), NOT the
 * canonical BSE week. Callers holding a canonical week must translate via
 * `rawWeekForCanonical` first. The returned map is keyed by game id, so the
 * caller's canonical-filtered schedule spine still selects the right slate.
 */
export async function getBoardSignals(season: number, week: number): Promise<BoardSignalResult> {
  const candidate = await getFrozenCandidate().catch(() => null)
  if (!candidate) return { meta: null, byGameId: new Map() }

  const threshold = candidate.threshold ?? 1
  const { rows } = await pool.query(
    `select cfbd_game_id, edge, market_spread_home, feature_complete
       from bse_board_signal
      where model_hash = $1 and season = $2 and week = $3`,
    [candidate.modelHash, season, week],
  )

  const byGameId = new Map<string, BoardSignal>()
  for (const r of rows) {
    const edge = Number(r.edge)
    if (!Number.isFinite(edge)) continue
    // Only surface a rating when the underlying feature row was complete/valid.
    if (r.feature_complete === false) continue
    const marketSpreadHome = r.market_spread_home == null ? null : Number(r.market_spread_home)
    byGameId.set(String(r.cfbd_game_id), buildBoardSignal(edge, marketSpreadHome, true, threshold))
  }

  return {
    meta: { modelHash: candidate.modelHash, threshold, count: byGameId.size },
    byGameId,
  }
}

/** Single-game convenience for the breakdown route. */
export async function getBoardSignalForGame(
  season: number,
  week: number,
  cfbdGameId: string,
): Promise<{ signal: BoardSignal | null; modelHash: string | null }> {
  const { meta, byGameId } = await getBoardSignals(season, week)
  return { signal: byGameId.get(cfbdGameId) ?? null, modelHash: meta?.modelHash ?? null }
}
