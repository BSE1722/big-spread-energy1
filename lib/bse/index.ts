/**
 * BSE service layer — public entry point.
 *
 * Live surfaces import branding/season/rating helpers from here. The frozen
 * model's per-game read reaches the UI through `@/lib/board-signal/service`
 * (backed by the `bse_board_signal` display cache), NOT through this barrel.
 *
 * The former mock board/parlay/pool generator modules were removed at launch —
 * every customer surface now renders real market data + the frozen model or an
 * honest empty state.
 */

export * from "./types"
export * from "./season"
export * from "./teams"
export * from "./leagues"
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
