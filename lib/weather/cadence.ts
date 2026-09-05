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
 *   > 7 days      → do not fetch (outside the useful / reliable forecast window)
 *   7 days → 24h  → every 3 hours
 *   24h → 6h      → hourly
 *   < 6h → kickoff→ every 30 minutes (highest practical resolution near kickoff)
 *   after kickoff → freeze; no more fetches
 *
 * These are FRESHNESS/SCHEDULING intervals only. They do not touch the weather
 * impact classification, its thresholds, or any BSE math.
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
  } else if (timeToKickoff > 24 * HOUR) {
    minIntervalMs = 3 * HOUR
    tier = "7d-24h-3h"
  } else if (timeToKickoff > 6 * HOUR) {
    minIntervalMs = HOUR
    tier = "24h-6h-hourly"
  } else {
    minIntervalMs = 30 * MIN
    tier = "under-6h-30m"
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

/**
 * Maximum age an `ok` forecast may reach before the customer-facing breakdown
 * must stop presenting it as CURRENT. Chosen generously relative to the refresh
 * cadence so a healthy scheduler never trips it — only a genuine ingestion
 * outage (several missed cycles) does:
 *   - inside 24h of kickoff (hourly/30-min tiers) → stale after 3 hours
 *   - 24h → 7d (3-hour tier)                      → stale after 8 hours
 *   - kickoff passed                              → never stale (the frozen
 *     final pre-kickoff reading is intentionally immutable)
 *
 * Pure policy: does not fetch, store, or alter any weather value.
 */
export function weatherStaleAfterMs(timeToKickoffMs: number): number {
  if (timeToKickoffMs <= 0) return Number.POSITIVE_INFINITY
  if (timeToKickoffMs <= 24 * HOUR) return 3 * HOUR
  return 8 * HOUR
}

/**
 * Decide whether the latest stored `ok` forecast is too old to be shown as
 * current. Returns false when we have no fetch timestamp (nothing to age) or
 * when kickoff has already passed (frozen final snapshot).
 */
export function isForecastStale(input: {
  kickoffMs: number
  fetchedMs: number | null
  now?: number
}): boolean {
  if (input.fetchedMs == null || !Number.isFinite(input.kickoffMs)) return false
  const now = input.now ?? Date.now()
  const timeToKickoff = input.kickoffMs - now
  if (timeToKickoff <= 0) return false
  const age = now - input.fetchedMs
  return age > weatherStaleAfterMs(timeToKickoff)
}
