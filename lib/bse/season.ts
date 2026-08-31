/**
 * ============================================================================
 * BSE SEASON / WEEK  —  SINGLE SOURCE OF TRUTH
 * ============================================================================
 * Everything week-aware on the site (The Board, homepage Top Edges, team
 * schedules, game cards, week labels, and the live CFBD routes) reads the
 * active college football season + week from HERE and nowhere else.
 *
 * The active week auto-advances from the real calendar: it is computed from
 * today's date against the season's Week 1 kickoff, and is CLAMPED so it never
 * shows earlier than Week 1 (the "Week 1 floor") or past the final week.
 *
 * To pin the site to a specific week manually (e.g. for testing or a hard
 * launch), set `WEEK_OVERRIDE` below. Leave it `null` for automatic advancement.
 * Changing one value here updates the entire site.
 * ============================================================================
 */

import type { League, Sport } from "./types"

export interface SeasonContext {
  sport: Sport
  league: League
  season: number
  week: number
  seasonType: "regular" | "postseason"
}

/* ------------------------------------------------------------------ */
/* Config — the only knobs.                                            */
/* ------------------------------------------------------------------ */

/** The season the site is currently operating in. */
const SEASON_YEAR = 2026

/**
 * College football's calendar is NOT a uniform 7-day grid. Week 1 is an
 * extended opening window (Labor Day weekend — 2026 FBS Week 1 games run
 * Aug 29 → Mon Sep 7), after which the season settles into a clean 7-day
 * cadence (Week 2: Sep 11–13, Week 3: Sep 17–20, …).
 *
 * So we model it in two parts:
 *   - Everything up to WEEK_TWO_START_UTC is Week 1 (with a pre-season floor).
 *   - From WEEK_TWO_START_UTC onward, weeks advance one per 7 days starting at
 *     Week 2. WEEK_TWO_START is the day AFTER Week 1's final game (Sep 7), so
 *     the board flips to the upcoming Week 2 slate once Week 1 has completed.
 *
 * A single uniform anchor cannot represent this (Week 1's own games span 9+
 * days), which is why the active week must be derived this way.
 */
const WEEK_TWO_START_UTC = "2026-09-08T00:00:00.000Z"

/** Regular season length (FBS plays through ~Week 15 + conf. championships). */
const TOTAL_REGULAR_WEEKS = 15

/**
 * Manual override. When set to a number, the whole site is pinned to that week
 * (still clamped to [1, TOTAL_REGULAR_WEEKS]). When `null`, the week is derived
 * from the current date with a Week 1 floor.
 */
const WEEK_OVERRIDE: number | null = null

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

/* ------------------------------------------------------------------ */
/* Derivation                                                          */
/* ------------------------------------------------------------------ */

function clampWeek(week: number): number {
  if (Number.isNaN(week)) return 1
  return Math.min(TOTAL_REGULAR_WEEKS, Math.max(1, Math.round(week)))
}

/**
 * Compute the active week for a given moment. Week 1 covers the extended
 * opening window (everything before WEEK_TWO_START, with a pre-season floor);
 * from WEEK_TWO_START onward the week advances one per 7 days beginning at
 * Week 2, clamped to the end of the regular season.
 */
export function computeCurrentWeek(now: Date = new Date()): number {
  if (WEEK_OVERRIDE != null) return clampWeek(WEEK_OVERRIDE)

  const weekTwoStart = new Date(WEEK_TWO_START_UTC).getTime()
  const elapsed = now.getTime() - weekTwoStart

  // Before Week 2 opens → the opening window is Week 1.
  if (elapsed < 0) return 1

  // Week 2 and beyond advance on a uniform 7-day cadence.
  const week = Math.floor(elapsed / MS_PER_WEEK) + 2
  return clampWeek(week)
}

/** The active season/week context — the value the whole app should read. */
export function getCurrentContext(now: Date = new Date()): SeasonContext {
  return {
    sport: "football",
    league: "ncaaf",
    season: SEASON_YEAR,
    week: computeCurrentWeek(now),
    seasonType: "regular",
  }
}

/** Human-facing eyebrow label, e.g. "NCAAF · WEEK 1 · 2026". */
export function seasonEyebrow(ctx: SeasonContext = getCurrentContext()): string {
  return `${ctx.league.toUpperCase()} · Week ${ctx.week} · ${ctx.season}`
}

/** Short week label, e.g. "Week 1". */
export function weekLabel(ctx: SeasonContext = getCurrentContext()): string {
  return `Week ${ctx.week}`
}

export const SEASON_CONFIG = {
  SEASON_YEAR,
  WEEK_TWO_START_UTC,
  TOTAL_REGULAR_WEEKS,
  WEEK_OVERRIDE,
} as const
