import type { LiveBoardGame } from "@/lib/use-live-board"

/**
 * ============================================================================
 * CURRENT-WEEK GAME SELECTION  —  shared derivation for homepage/preview
 * surfaces so they never maintain their own schedule. Everything here operates
 * on the live board games already fetched from /api/cfbd-board, which means the
 * homepage, hero, and any other consumer advance automatically when the active
 * week changes in lib/bse/season.ts.
 * ============================================================================
 */

/** True when at least one board game has a real BSE rating from the model. */
export function hasAnyRating(games: LiveBoardGame[]): boolean {
  return games.some((g) => g.bseRating != null)
}

/**
 * Orders the current-week slate for preview surfaces.
 *
 * - When the model has produced ratings, rank by real BSE Rating (desc) so the
 *   strongest games surface first.
 * - Until then, return the slate in kickoff order. This is an honest
 *   "current-week preview" — it never calls arbitrary games "top rated" or
 *   invents an ordering that implies a rating exists.
 */
export function rankBoardGames(
  games: LiveBoardGame[],
  projectionsAvailable: boolean,
): LiveBoardGame[] {
  const ranked = [...games]
  if (projectionsAvailable && hasAnyRating(games)) {
    ranked.sort((a, b) => (b.bseRating ?? -Infinity) - (a.bseRating ?? -Infinity))
  } else {
    ranked.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
  }
  return ranked
}

/** The top `count` current-week games for a compact preview (default 3). */
export function topBoardGames(
  games: LiveBoardGame[],
  projectionsAvailable: boolean,
  count = 3,
): LiveBoardGame[] {
  return rankBoardGames(games, projectionsAvailable).slice(0, count)
}
