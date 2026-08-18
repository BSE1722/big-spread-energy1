/**
 * Free vs BSE Pro access architecture. NO payments, NO auth — just the
 * entitlement shape and defaults so the UI can gate features today and a real
 * billing/session system can set the tier later.
 */

import type { Entitlements, Tier } from "./types"

export const ENTITLEMENTS: Record<Tier, Entitlements> = {
  free: {
    boardRowLimit: 3,
    parlayAnalyzerLegLimit: 3,
    parlayGenerations: 1,
    gettingParlaid: true, // limited (see parlayGenerations)
    lineMovement: false,
    bestLineComparison: false,
    alerts: false,
    fullRatings: false,
    modelBreakdown: false,
  },
  pro: {
    boardRowLimit: null,
    parlayAnalyzerLegLimit: null,
    parlayGenerations: null,
    gettingParlaid: true,
    lineMovement: true,
    bestLineComparison: true,
    alerts: true,
    fullRatings: true,
    modelBreakdown: true,
  },
}

export function getEntitlements(tier: Tier): Entitlements {
  return ENTITLEMENTS[tier]
}

/**
 * Current tier resolver. Hard-coded to "free" today (no auth). A future session
 * layer will replace this — the UI just calls `getCurrentTier()`.
 */
export function getCurrentTier(): Tier {
  return "free"
}

export const PRO_FEATURES: string[] = [
  "Full Board access (all games, all markets)",
  "Deeper model information & factor breakdown",
  "Unlimited Parlay Analyzer usage",
  "Getting Parlaid optimization (all objectives)",
  "Line movement & opening-line history",
  "Best-line comparison across sportsbooks",
  "Line-change alerts",
  "Advanced analytics",
]

export const FREE_FEATURES: string[] = [
  "Limited Board access (top games)",
  "Selected BSE Ratings",
  "Limited Parlay Analyzer (up to 3 legs)",
  "1 Getting Parlaid generation",
]
