"use client"

import { useEffect, useState } from "react"

/** One live board game as returned by /api/cfbd-board. */
export interface LiveBoardGame {
  id: string
  season: number
  week: number
  kickoff: string
  kickoffTBD: boolean
  neutralSite: boolean
  away: { name: string; abbr: string }
  home: { name: string; abbr: string }

  // Live DraftKings markets (SportsGameOdds). Home-relative spread; null = unavailable.
  marketSpread: number | null
  /** Real DraftKings American prices for each side of the main spread (for the price-aware layer). */
  marketSpreadPrice?: { home: number | null; away: number | null }
  marketTotal: number | null
  marketMoneyline?: { home: number | null; away: number | null }
  oddsStatus?: "matched" | "unavailable"

  // Internal audit metadata (traceability) — not rendered, preserved for auditability.
  odds?: {
    bookmaker: string
    sgoEventID: string | null
    sourceOddIDs: { spread: string | null; moneyline: string | null; total: string | null }
    updatedAt: string | null
    totalWithinPlausibleRange: boolean
    rawTotalPoints: number | null
    lineHistory?: unknown
  }

  // BSE model output — null until the engine is wired.
  fairSpread: number | null
  fairTotal: number | null
  edgeSpread: number | null
  edgeTotal: number | null
  bseRating: number | null
  pick: string | null
}

interface LiveBoardResponse {
  ok: boolean
  season: number
  week: number
  seasonType: string
  projectionsAvailable: boolean
  count: number
  games: LiveBoardGame[]
  error?: string
  /** Set by the API when a failure is transient (e.g. upstream rate limit) and worth auto-retrying. */
  retryable?: boolean
}

export interface LiveBoardState {
  games: LiveBoardGame[]
  season: number | null
  week: number | null
  projectionsAvailable: boolean
  loading: boolean
  error: string | null
}

/**
 * Fetches the real games for the active season/week from /api/cfbd-board.
 * Mirrors the plain-fetch pattern already used by the team search (no SWR
 * dependency in this project).
 */
export function useLiveBoard(): LiveBoardState {
  const [state, setState] = useState<LiveBoardState>({
    games: [],
    season: null,
    week: null,
    projectionsAvailable: false,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    // Bounded auto-retry so a transient upstream hiccup (e.g. CFBD 429) heals
    // on its own instead of stranding the visitor on an error message.
    const MAX_RETRIES = 4
    const RETRY_DELAYS_MS = [3000, 6000, 12000, 20000]

    async function load(attempt: number) {
      try {
        const res = await fetch("/api/cfbd-board")
        const data: LiveBoardResponse = await res.json()
        if (cancelled) return
        if (!res.ok || !data.ok) {
          const retryable = data.retryable === true || res.status === 503 || res.status === 429
          if (retryable && attempt < MAX_RETRIES) {
            // Keep any last-known games on screen; show the transient message.
            setState((s) => ({
              ...s,
              loading: true,
              error: data.error || `Board request failed: ${res.status}`,
            }))
            retryTimer = setTimeout(() => load(attempt + 1), RETRY_DELAYS_MS[attempt])
            return
          }
          throw new Error(data.error || `Board request failed: ${res.status}`)
        }
        setState({
          games: data.games,
          season: data.season,
          week: data.week,
          projectionsAvailable: data.projectionsAvailable,
          loading: false,
          error: null,
        })
      } catch (err) {
        if (cancelled) return
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load board",
        }))
      }
    }
    load(0)
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  return state
}

// Pure kickoff formatters live in a non-client module so Server Components can
// use them too; re-exported here for existing client board consumers.
export { formatKickoff, formatKickoffDate } from "@/lib/format-kickoff"

/**
 * The market spread is stored home-relative (negative = home favored). Returns
 * the favorite — the team giving points — beside its own negative line, e.g.
 * "TCU -7.5". Returns "PK" for a pick'em and null when no market spread exists,
 * so callers can apply their own placeholder.
 */
export function formatFavoredSpread(
  g: Pick<LiveBoardGame, "marketSpread" | "home" | "away">,
): string | null {
  const s = g.marketSpread
  if (s == null) return null
  if (s === 0) return "PK"
  const favAbbr = s < 0 ? g.home.abbr : g.away.abbr
  const favLine = s < 0 ? s : -s
  return `${favAbbr} ${favLine.toFixed(1)}`
}


