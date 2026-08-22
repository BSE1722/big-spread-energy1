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
 * Kickoff (UTC) of Week 1 of the season. Weeks are measured in 7-day buckets
 * forward from this date. 2026 FBS Week 1 opens the week of Aug 29, 2026;
 * we anchor to the Monday of that week so games Thu–Sat land in Week 1.
 */
const WEEK_ONE_START_UTC = "2026-08-24T00:00:00.000Z"

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
 * Compute the active week for a given moment. Before/at the season start this
 * floors to Week 1; afterward it advances one week per 7 days, clamped to the
 * end of the regular season.
 */
export function computeCurrentWeek(now: Date = new Date()): number {
  if (WEEK_OVERRIDE != null) return clampWeek(WEEK_OVERRIDE)

  const start = new Date(WEEK_ONE_START_UTC).getTime()
  const elapsed = now.getTime() - start

  // Before the season opens → hold at the Week 1 floor.
  if (elapsed < 0) return 1

  const week = Math.floor(elapsed / MS_PER_WEEK) + 1
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
  WEEK_ONE_START_UTC,
  TOTAL_REGULAR_WEEKS,
  WEEK_OVERRIDE,
} as const
