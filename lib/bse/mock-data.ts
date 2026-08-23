/**
 * ============================================================================
 * BSE MOCK / DEMO DATA  —  NOT REAL SPORTSBOOK DATA
 * ============================================================================
 * Every value in this file is hand-authored demo data used to exercise the
 * BSE calculation architecture. It is intentionally the ONLY place raw game
 * facts live. When a live odds API + the proprietary BSE model come online,
 * replace `getRawGames()` / `getRawTeamMetrics()` with real providers and the
 * rest of the app (services + UI) keeps working unchanged.
 *
 * DO NOT present any number derived from this file as a real result, record,
 * or profitability claim in production-facing UI.
 * ============================================================================
 */

import type { DataSource, GameSeed, League, RawTeamMetrics, Sport, Sportsbook } from "./types"
import { getCurrentContext } from "./season"
import { getTeamColor } from "./teams"

/** All values below are demo data. This flag is stamped onto every Game. */
export const MOCK_DATA_SOURCE: DataSource = "mock"

/**
 * Human-facing banner text. Market lines shown on the Board are live
 * (SportsGameOdds / DraftKings); the BSE Rating and model edges are what
 * publish before kickoff. Kept honest so nothing on a live surface is
 * mislabeled as fake, and nothing pending is implied to already exist.
 */
export const MOCK_DATA_LABEL =
  "Market lines are live. BSE Ratings & model edges publish before kickoff."

/** When this mock snapshot was authored (stamped as `lastUpdated`). */
export const MOCK_SNAPSHOT_TIME = "2026-08-18T14:00:00.000Z"

/**
 * Active season/week for the whole site. This is now DERIVED from the single
 * source of truth in `./season` (date-driven, Week 1 floor for 2026) instead of
 * being hard-coded. Everything that reads `CURRENT_CONTEXT` (board header, game
 * stamps, week labels) advances automatically as the season progresses.
 */
export const CURRENT_CONTEXT: {
  sport: Sport
  league: League
  season: number
  week: number
} = getCurrentContext()

/**
 * Opponent-adjusted team metric PLACEHOLDERS. These are demo stand-ins for the
 * opponent-adjusted efficiency numbers the real BSE model will consume
 * (offensive/defensive efficiency, explosiveness, success rate, finishing
 * drives, pace, etc.). Values are on an arbitrary 0-100 demo scale.
 */
const RAW_TEAM_METRICS: Record<string, RawTeamMetrics> = {
  Georgia: { rating: 92, offense: 90, defense: 88, explosiveness: 84, pace: 66 },
  "Ole Miss": { rating: 78, offense: 82, defense: 70, explosiveness: 80, pace: 74 },
  "Ohio State": { rating: 94, offense: 92, defense: 90, explosiveness: 86, pace: 68 },
  "Penn State": { rating: 84, offense: 80, defense: 85, explosiveness: 74, pace: 63 },
  Texas: { rating: 88, offense: 87, defense: 82, explosiveness: 82, pace: 70 },
  "Oklahoma State": { rating: 74, offense: 76, defense: 68, explosiveness: 72, pace: 72 },
  Oregon: { rating: 90, offense: 91, defense: 84, explosiveness: 88, pace: 75 },
  Washington: { rating: 76, offense: 78, defense: 72, explosiveness: 74, pace: 71 },
  "Notre Dame": { rating: 83, offense: 79, defense: 84, explosiveness: 73, pace: 64 },
  Clemson: { rating: 79, offense: 78, defense: 80, explosiveness: 72, pace: 67 },
  Alabama: { rating: 91, offense: 89, defense: 87, explosiveness: 83, pace: 69 },
  LSU: { rating: 82, offense: 85, defense: 76, explosiveness: 81, pace: 73 },
  Michigan: { rating: 85, offense: 80, defense: 88, explosiveness: 72, pace: 61 },
  "Miami FL": { rating: 81, offense: 83, defense: 77, explosiveness: 79, pace: 72 },
}

/**
 * Compact per-game seeds. A seed carries only the facts a data provider would
 * supply (matchup, kickoff, consensus market lines, opening lines, and a demo
 * "fair line" stand-in for model output). The board builder + services derive
 * everything else (probabilities, EV, edge, ratings, movement).
 */
const GAME_SEEDS: GameSeed[] = [
  {
    id: "ncaaf-2026-w12-uga-olemiss",
    kickoff: "2026-08-22T16:00:00.000Z",
    away: { name: "Georgia", rank: 2, abbr: "UGA" },
    home: { name: "Ole Miss", rank: 14, abbr: "MISS" },
    markets: {
      // Fair lines sit only modestly off market — realistic, defensible edges,
      // never lottery-ticket blowouts.
      spread: { marketLine: -7, openLine: -6.5, fairLineDemo: -8.4, confidence: 0.82 },
      moneyline: { marketLine: -285, openLine: -260, fairLineDemo: -320, confidence: 0.8 },
      total: { marketLine: 55.5, openLine: 56.5, fairLineDemo: 54.4, confidence: 0.6 },
    },
  },
  {
    id: "ncaaf-2026-w12-osu-psu",
    kickoff: "2026-08-22T19:30:00.000Z",
    away: { name: "Ohio State", rank: 1, abbr: "OSU" },
    home: { name: "Penn State", rank: 8, abbr: "PSU" },
    markets: {
      spread: { marketLine: -6.5, openLine: -5.5, fairLineDemo: -7.9, confidence: 0.78 },
      moneyline: { marketLine: -245, openLine: -210, fairLineDemo: -280, confidence: 0.76 },
      total: { marketLine: 48.5, openLine: 49.5, fairLineDemo: 47.4, confidence: 0.55 },
    },
  },
  {
    id: "ncaaf-2026-w12-tex-okst",
    kickoff: "2026-08-22T23:00:00.000Z",
    away: { name: "Texas", rank: 5, abbr: "TEX" },
    home: { name: "Oklahoma State", rank: 19, abbr: "OKST" },
    markets: {
      spread: { marketLine: -3.5, openLine: -4.5, fairLineDemo: -4.8, confidence: 0.7 },
      moneyline: { marketLine: -175, openLine: -190, fairLineDemo: -200, confidence: 0.68 },
      total: { marketLine: 59.5, openLine: 58.5, fairLineDemo: 60.6, confidence: 0.5 },
    },
  },
  {
    id: "ncaaf-2026-w12-ore-wash",
    kickoff: "2026-08-23T02:30:00.000Z",
    away: { name: "Oregon", rank: 3, abbr: "ORE" },
    home: { name: "Washington", rank: 24, abbr: "WASH" },
    markets: {
      spread: { marketLine: -10.5, openLine: -9.5, fairLineDemo: -11.6, confidence: 0.72 },
      moneyline: { marketLine: -410, openLine: -360, fairLineDemo: -455, confidence: 0.7 },
      total: { marketLine: 62.5, openLine: 61.5, fairLineDemo: 63.3, confidence: 0.48 },
    },
  },
  {
    id: "ncaaf-2026-w12-nd-clem",
    kickoff: "2026-08-23T17:00:00.000Z",
    away: { name: "Notre Dame", rank: 10, abbr: "ND" },
    home: { name: "Clemson", rank: 20, abbr: "CLEM" },
    markets: {
      spread: { marketLine: -2, openLine: -1.5, fairLineDemo: -3, confidence: 0.62 },
      moneyline: { marketLine: -130, openLine: -120, fairLineDemo: -148, confidence: 0.6 },
      total: { marketLine: 44.5, openLine: 45.5, fairLineDemo: 43.8, confidence: 0.44 },
    },
  },
  {
    id: "ncaaf-2026-w12-bama-lsu",
    kickoff: "2026-08-23T20:30:00.000Z",
    away: { name: "Alabama", rank: 4, abbr: "BAMA" },
    home: { name: "LSU", rank: 12, abbr: "LSU" },
    markets: {
      // A near-fair market: tiny edge, low confidence — should NOT earn a high
      // BSE rating just because a small line gap exists.
      spread: { marketLine: -3, openLine: -2.5, fairLineDemo: -3.2, confidence: 0.5 },
      moneyline: { marketLine: -155, openLine: -140, fairLineDemo: -162, confidence: 0.48 },
      total: { marketLine: 51.5, openLine: 52.5, fairLineDemo: 51.2, confidence: 0.42 },
    },
  },
  {
    id: "ncaaf-2026-w12-mich-miami",
    kickoff: "2026-08-24T00:00:00.000Z",
    away: { name: "Michigan", rank: 9, abbr: "MICH" },
    home: { name: "Miami FL", rank: 15, abbr: "MIA" },
    markets: {
      spread: { marketLine: 1.5, openLine: 2.5, fairLineDemo: 0.4, confidence: 0.55 },
      moneyline: { marketLine: 105, openLine: 120, fairLineDemo: -108, confidence: 0.52 },
      total: { marketLine: 46.5, openLine: 47.5, fairLineDemo: 46, confidence: 0.4 },
    },
  },
]

export function getRawGames(): GameSeed[] {
  return GAME_SEEDS
}

export function getRawTeamMetrics(team: string): RawTeamMetrics | undefined {
  return RAW_TEAM_METRICS[team]
}

/**
 * Team branding used for the logo chips shown next to team names. We store each
 * school's primary color (not the trademarked logo art) so the UI can render a
 * legally-safe monogram badge. Add an optional `logo` image URL here later and
 * the TeamLogo component will prefer it automatically — no component changes.
 */
export interface TeamBranding {
  /** Primary brand color (hex). */
  color: string
  /** Optional logo image URL — takes precedence over the color monogram when set. */
  logo?: string
}

/**
 * Colors now come from the centralized team registry (`./teams`), which covers
 * every FBS team using official CollegeFootballData brand colors. Lookups accept
 * a full school name or an abbreviation, so every team renders its real color.
 */
export function getTeamBranding(team: string): TeamBranding {
  return { color: getTeamColor(team) }
}

/** Demo sportsbooks used to synthesize a multi-book market for best-line comparison. */
export const MOCK_SPORTSBOOKS: { id: Sportsbook; label: string }[] = [
  { id: "draftkings", label: "DraftKings" },
  { id: "fanduel", label: "FanDuel" },
  { id: "betmgm", label: "BetMGM" },
  { id: "caesars", label: "Caesars" },
]
