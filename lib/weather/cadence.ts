/**
 * Tiered weather refresh cadence.
 *
 * Forecast confidence rises and late changes matter more as kickoff nears, so
 * we refresh more frequently the closer we get. This module is PURE policy: it
 * decides whether a game is due for a new pull given its kickoff and the last
 * time we fetched it. The ingestion job calls this; nothing here fetches or
 * stores.
 */

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/**
 * Minimum interval between pulls, by time remaining until kickoff:
 *   > 7 days      → do not fetch (outside reliable hourly horizon)
 *   7 days → 48h  → once daily
 *   48h → 12h     → every 6 hours
 *   12h → 3h      → hourly
 *   < 3h → kickoff→ every 30 minutes
 *   after kickoff → freeze; no more fetches
 */
export interface CadenceDecision {
  /** Whether a fresh pull should happen now. */
  due: boolean
  /** Whether kickoff has passed (caller freezes the final pre-kickoff row). */
  afterKickoff: boolean
  /** Minimum spacing for the current tier (ms); null when outside horizon. */
  minIntervalMs: number | null
  /** Human tier label for logging/admin. */
  tier: string
}

export function decideRefresh(input: {
  kickoffMs: number
  lastFetchedMs: number | null
  now?: number
}): CadenceDecision {
  const now = input.now ?? Date.now()
  const timeToKickoff = input.kickoffMs - now

  if (timeToKickoff <= 0) {
    return { due: false, afterKickoff: true, minIntervalMs: null, tier: "after-kickoff" }
  }

  let minIntervalMs: number | null
  let tier: string
  if (timeToKickoff > 7 * DAY) {
    minIntervalMs = null
    tier = "beyond-7d"
  } else if (timeToKickoff > 48 * HOUR) {
    minIntervalMs = DAY
    tier = "7d-48h-daily"
  } else if (timeToKickoff > 12 * HOUR) {
    minIntervalMs = 6 * HOUR
    tier = "48h-12h-6h"
  } else if (timeToKickoff > 3 * HOUR) {
    minIntervalMs = HOUR
    tier = "12h-3h-hourly"
  } else {
    minIntervalMs = 30 * MIN
    tier = "under-3h-30m"
  }

  if (minIntervalMs == null) {
    return { due: false, afterKickoff: false, minIntervalMs: null, tier }
  }

  // Never fetched yet within a valid tier → due now.
  if (input.lastFetchedMs == null) {
    return { due: true, afterKickoff: false, minIntervalMs, tier }
  }

  const elapsed = now - input.lastFetchedMs
  return { due: elapsed >= minIntervalMs, afterKickoff: false, minIntervalMs, tier }
}
