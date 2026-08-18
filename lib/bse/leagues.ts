import type { League, LeagueConfig } from "./types"

/**
 * Per-league constants. College football is the active focus; NFL is
 * scaffolded so additional sports/leagues can be added without rebuilding
 * the system. Std-dev values are used to convert a fair line into a
 * probability (see model.ts) and are well-established public estimates,
 * NOT proprietary model output.
 */
export const LEAGUES: Record<League, LeagueConfig> = {
  ncaaf: {
    league: "ncaaf",
    sport: "football",
    displayName: "College Football",
    marginStdDev: 16,
    totalStdDev: 10,
    homeFieldAdvantage: 2.5,
    active: true,
  },
  nfl: {
    league: "nfl",
    sport: "football",
    displayName: "NFL",
    marginStdDev: 13.5,
    totalStdDev: 9,
    homeFieldAdvantage: 2,
    active: false,
  },
}

export const ACTIVE_LEAGUES: League[] = (Object.keys(LEAGUES) as League[]).filter(
  (l) => LEAGUES[l].active,
)

export function getLeagueConfig(league: League): LeagueConfig {
  return LEAGUES[league]
}
