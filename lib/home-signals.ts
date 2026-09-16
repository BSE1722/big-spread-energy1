import { LINE_EDGE_GATE } from "@/lib/bse/price-aware"
import type { LiveBoardGame } from "@/lib/use-live-board"

/**
 * ============================================================================
 * HOMEPAGE LIVE-SIGNAL DERIVATION  —  PRESENTATION ONLY
 * ============================================================================
 * Pure, client-safe shaping of the live board slate into the "loud" homepage
 * surfaces (hero signal, Saturday Command Center categories, What Does BSE See).
 *
 * It performs NO model math. Every number it reads — marketSpread, fairSpread,
 * bseRating — is already produced by the frozen model / market snapshot and
 * arrives on each `LiveBoardGame` from `/api/cfbd-board`. The one derived value,
 * the BSE-vs-market gap, is the exact transparent arithmetic the breakdown
 * verdict already uses: `gap(home) = marketSpread - fairSpread`. Because today's
 * context adjustments are all 0 (see context-engine), the board's fairSpread is
 * the FINAL fair spread, so this gap equals the audited verdict edge.
 *
 * Nothing here invents line movement, weather, or ratings: a surface simply
 * omits any game that lacks the underlying data.
 * ============================================================================
 */

/** Minimum |gap| (points) at which BSE is asserting a real disagreement. */
export const DISAGREE_GATE = LINE_EDGE_GATE

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export interface HomeSignal {
  game: LiveBoardGame
  /** Home-relative market spread (negative = home favored). */
  marketSpread: number
  /** Home-relative BSE fair spread. */
  fairSpread: number
  /** marketSpread - fairSpread (home-relative). |gap| = disagreement size. */
  gap: number
  absGap: number
  /** The side BSE sees value on at the current number. */
  valueSide: "home" | "away"
  valueTeam: { name: string; abbr: string }
  rating: number | null
  /** True once the disagreement clears BSE's tracking gate. */
  disagrees: boolean
}

/** Build a signal for a game, or null when market or fair spread is missing. */
export function toHomeSignal(g: LiveBoardGame): HomeSignal | null {
  if (g.marketSpread == null || g.fairSpread == null) return null
  const gap = round1(g.marketSpread - g.fairSpread)
  const absGap = Math.abs(gap)
  const valueSide: "home" | "away" = gap >= 0 ? "home" : "away"
  return {
    game: g,
    marketSpread: g.marketSpread,
    fairSpread: g.fairSpread,
    gap,
    absGap,
    valueSide,
    valueTeam: valueSide === "home" ? g.home : g.away,
    rating: g.bseRating,
    disagrees: absGap >= DISAGREE_GATE,
  }
}

/**
 * The single most interesting live signal: the largest absolute BSE-vs-market
 * disagreement among games that ALSO carry a real BSE rating. Returns null when
 * no rated game has both a market and fair line yet (hero then falls back).
 */
export function heroSignal(games: LiveBoardGame[]): HomeSignal | null {
  const rated = games
    .filter((g) => g.bseRating != null)
    .map(toHomeSignal)
    .filter((s): s is HomeSignal => s != null && s.absGap > 0)
  if (rated.length === 0) return null
  return rated.sort((a, b) => b.absGap - a.absGap)[0]
}

/** A game whose kickoff is still in the future (or TBD, which hasn't happened). */
export function isUpcoming(g: LiveBoardGame, now: number = Date.now()): boolean {
  if (g.kickoffTBD) return true
  const t = new Date(g.kickoff).getTime()
  return Number.isFinite(t) ? t > now : true
}

/**
 * What the hero headlines. Two honest shapes:
 *  - `signal`: a full BSE-vs-market disagreement (needs both a live market line
 *    and a fair line). Carries the gap/edge.
 *  - `rating`: BSE's fair number + rating only, when no live market line exists
 *    to compare against (e.g. between slates). NO edge is asserted — we never
 *    invent a disagreement without a real market line.
 * `upcoming` flags whether the headlined game is still to be played, so the UI
 * can avoid calling a finished game "LIVE".
 */
export type HeroFeature =
  | { kind: "signal"; signal: HomeSignal; upcoming: boolean }
  | {
      kind: "rating"
      game: LiveBoardGame
      fairSpread: number
      rating: number | null
      upcoming: boolean
    }

function bestSignalIn(pool: LiveBoardGame[]): HomeSignal | null {
  const rated = pool
    .filter((g) => g.bseRating != null)
    .map(toHomeSignal)
    .filter((s): s is HomeSignal => s != null && s.absGap > 0)
  if (rated.length === 0) return null
  return rated.sort((a, b) => b.absGap - a.absGap)[0]
}

function bestRatingIn(pool: LiveBoardGame[]): LiveBoardGame | null {
  const rated = pool.filter((g) => g.bseRating != null && g.fairSpread != null)
  if (rated.length === 0) return null
  return rated.sort((a, b) => (b.bseRating ?? 0) - (a.bseRating ?? 0))[0]
}

/**
 * Choose the hero feature, preferring games that are still upcoming so the hero
 * never headlines a finished game as a live signal. Within each pool it prefers
 * a full disagreement signal, then falls back to a rating-only feature. Returns
 * null only when no rated game with a fair line exists at all.
 */
export function heroFeature(games: LiveBoardGame[], now: number = Date.now()): HeroFeature | null {
  const upcoming = games.filter((g) => isUpcoming(g, now))

  const upSignal = bestSignalIn(upcoming)
  if (upSignal) return { kind: "signal", signal: upSignal, upcoming: true }

  const upRating = bestRatingIn(upcoming)
  if (upRating) {
    return { kind: "rating", game: upRating, fairSpread: upRating.fairSpread as number, rating: upRating.bseRating, upcoming: true }
  }

  const anySignal = bestSignalIn(games)
  if (anySignal) return { kind: "signal", signal: anySignal, upcoming: false }

  const anyRating = bestRatingIn(games)
  if (anyRating) {
    return { kind: "rating", game: anyRating, fairSpread: anyRating.fairSpread as number, rating: anyRating.bseRating, upcoming: false }
  }

  return null
}

/** Top `n` games by absolute BSE-vs-market disagreement (Hot Board). */
export function topDisagreements(games: LiveBoardGame[], n = 4): HomeSignal[] {
  return games
    .map(toHomeSignal)
    .filter((s): s is HomeSignal => s != null && s.absGap > 0)
    .sort((a, b) => b.absGap - a.absGap)
    .slice(0, n)
}

/** Top `n` games by real BSE rating (desc). Only rated games qualify. */
export function topRatings(games: LiveBoardGame[], n = 4): LiveBoardGame[] {
  return games
    .filter((g) => g.bseRating != null)
    .sort((a, b) => (b.bseRating ?? 0) - (a.bseRating ?? 0))
    .slice(0, n)
}

/** The next `n` kickoffs in chronological order. */
export function nextKickoffs(games: LiveBoardGame[], n = 4): LiveBoardGame[] {
  return [...games]
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    .slice(0, n)
}

/**
 * Format a home-relative spread as the favorite giving points, using team
 * abbreviations, e.g. "-14.5" beside "ORE". Returns "PK" for a pick'em.
 */
export function formatFavoredHomeRel(
  value: number,
  home: { abbr: string },
  away: { abbr: string },
): { abbr: string; line: string } {
  if (value === 0) return { abbr: "", line: "PK" }
  const favAbbr = value < 0 ? home.abbr : away.abbr
  const favLine = value < 0 ? value : -value
  return { abbr: favAbbr, line: favLine.toFixed(1) }
}

/** Signed edge string, e.g. "+3.0". */
export function formatEdge(absGap: number): string {
  return `+${absGap.toFixed(1)}`
}

const BOOK_LABELS: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
}

/** Human book label from the stored bookmaker id. */
export function bookLabel(bookmaker: string | null | undefined): string {
  if (!bookmaker) return "DraftKings"
  return BOOK_LABELS[bookmaker.toLowerCase()] ?? bookmaker
}
