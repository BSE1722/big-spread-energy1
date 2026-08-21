/**
 * BSE service layer — public entry point.
 *
 * The UI imports from `@/lib/bse` (or `@/lib/bse/hooks`) and never reaches into
 * mock-data directly. Swapping mock data for a live odds API + the real model
 * happens behind this boundary with no UI changes.
 */

export * from "./types"
export * from "./season"
export * from "./odds"
export * from "./leagues"
export * from "./model"
export * from "./rating"
export * from "./correlation"
export * from "./board"
export * from "./pool"
export * from "./parlay"
export * from "./generator"
export * from "./reevaluate"
export * from "./tiers"
export {
  CURRENT_CONTEXT,
  MOCK_DATA_LABEL,
  MOCK_DATA_SOURCE,
  MOCK_SNAPSHOT_TIME,
  MOCK_SPORTSBOOKS,
  getRawTeamMetrics,
  getTeamBranding,
  type TeamBranding,
} from "./mock-data"
