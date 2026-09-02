/**
 * ============================================================================
 * BSE WEEK IDENTITY  —  raw provider week  <->  canonical BSE week
 * ============================================================================
 *
 * THE PROBLEM (established by data audit, Aug 2026):
 * College football opens with a "Week 0" (a handful of games the weekend BEFORE
 * the first full slate), but our data provider CFBD does NOT label it that way.
 * CFBD tags BOTH the opening-weekend games (Aug 29–30, 2026) AND the first full
 * slate (Sep 3–7, 2026) as `week = 1`. There is no `week = 0` anywhere in the
 * CFBD payload, and every downstream table we ingested (hist_raw_games,
 * hist_training_rows, bse_board_signal, bse_shadow_signal) faithfully mirrors
 * that raw label. So a single stored `week = 1` actually contains two distinct
 * real-world slates fused together — which is why the board showed ~51 games
 * under "Week 1" and teams like USC appeared to play twice.
 *
 * Weeks 2 and beyond are unaffected: CFBD's `week = N` (N ≥ 2) already lines up
 * one-to-one with the real BSE week N.
 *
 * THE FIX (non-destructive normalization, NOT a data rewrite):
 * We PRESERVE the raw provider week exactly as stored, and derive a *canonical*
 * BSE week on read. The only ambiguous input is raw week 1, which we split by
 * kickoff date:
 *
 *     raw week 1  &  kickoff <  WEEK_ONE_SLATE_START  ->  BSE Week 0
 *     raw week 1  &  kickoff >= WEEK_ONE_SLATE_START  ->  BSE Week 1
 *     raw week N  (N >= 2)                            ->  BSE Week N
 *
 * And the inverse, for querying providers/tables that only understand the raw
 * label:
 *
 *     BSE Week 0 or 1  ->  raw week 1   (then filter by date to the right slate)
 *     BSE Week N (>=2) ->  raw week N
 *
 * This module is the SINGLE place that mapping lives. Nothing else should
 * hard-code the Aug/Sep boundary or assume raw week == display week.
 * ============================================================================
 */

/**
 * Per-season kickoff instant that separates the two slates CFBD fuses inside raw
 * `week = 1`: everything BEFORE the boundary is the "Week 0" opener, everything
 * on/after is the first full "Week 1" slate.
 *
 * This is SEASON-SCOPED on purpose. The boundary is a real calendar date, so it
 * differs every year, and — critically — the historical validation data
 * (2015–2023) must NOT be reinterpreted with a current-season boundary. A season
 * that is not listed here has NO split: its raw weeks are already canonical and
 * pass through unchanged. Add a new season here each year once its opener /
 * first-full-slate dates are known.
 *
 * 2026: Week 0 games are Aug 29–30; the first full Week 1 slate is Sep 3–7. Any
 * instant between Aug 31 and Sep 2 separates them; we use Sep 1 00:00 UTC.
 */
const SEASON_WEEK_ONE_SLATE_START_UTC: Record<number, string> = {
  2026: "2026-09-01T00:00:00.000Z",
}

/** The raw provider week that can be ambiguous (contains Week 0 + Week 1). */
const AMBIGUOUS_RAW_WEEK = 1

/** True when the given season has a configured Week 0 / Week 1 split. */
export function seasonHasWeekZeroSplit(season: number): boolean {
  return SEASON_WEEK_ONE_SLATE_START_UTC[season] != null
}

/**
 * Given a game's SEASON, RAW provider week, and kickoff, return the canonical
 * BSE week. Only raw week 1 of a season WITH a configured split is ambiguous and
 * split by kickoff date; every other input passes through unchanged (so
 * historical seasons and raw weeks >= 2 are never reinterpreted).
 */
export function canonicalWeekForGame(
  season: number,
  rawWeek: number,
  kickoff: string | Date | null | undefined,
): number {
  if (rawWeek !== AMBIGUOUS_RAW_WEEK) return rawWeek

  const boundaryIso = SEASON_WEEK_ONE_SLATE_START_UTC[season]
  if (boundaryIso == null) return rawWeek // season has no split → raw == canonical

  const ms = kickoff == null ? NaN : new Date(kickoff).getTime()
  // Unknown kickoff → assume the full Week 1 slate (the common case), never the
  // rarer Week 0 opener, so a missing date can't silently hide real Week 1 games.
  if (!Number.isFinite(ms)) return 1

  return ms < new Date(boundaryIso).getTime() ? 0 : 1
}

/**
 * Given a canonical BSE week, return the RAW provider week to query CFBD or the
 * ingested tables with. Canonical Weeks 0 and 1 both live under raw week 1;
 * everything else maps to itself. This is season-agnostic: for a season with no
 * split, canonical week N already equals raw week N, so the identity holds.
 * Callers that need a specific slate out of raw week 1 must additionally filter
 * by canonical week (see `filterToCanonicalWeek`).
 */
export function rawWeekForCanonical(canonicalWeek: number): number {
  if (canonicalWeek <= 1) return AMBIGUOUS_RAW_WEEK
  return canonicalWeek
}

/**
 * Filter a list of games (each carrying season + raw week + kickoff) down to
 * only those that belong to the requested canonical BSE week. For raw weeks >= 2
 * or seasons without a split this is a pass-through; for the ambiguous raw week 1
 * of a split season it selects the correct slate.
 */
export function filterToCanonicalWeek<
  T extends { season: number; week: number; kickoff: string | Date | null | undefined },
>(games: T[], canonicalWeek: number): T[] {
  return games.filter((g) => canonicalWeekForGame(g.season, g.week, g.kickoff) === canonicalWeek)
}

/** Human label for a canonical week, e.g. "Week 0" (opener) or "Week 3". */
export function canonicalWeekLabel(canonicalWeek: number): string {
  return `Week ${canonicalWeek}`
}
