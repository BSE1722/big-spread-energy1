// TEMP diagnostic (launch audit). Traces the exact production feature path.
import { makePool } from "../lib.mjs"
import { loadFrozenArtifact, scoreFrozen, validateServingRow } from "./score-frozen.mjs"

const FEATURE_SELECT = `
  "gameId", season, week, "seasonType", "startDate",
  "homeTeam", "awayTeam", both_fbs, neutral_site,
  elo_diff, talent_diff,
  home_prior_sp, away_prior_sp, home_prior_srs, away_prior_srs, home_prior_fpi, away_prior_fpi,
  home_recruiting_points, away_recruiting_points,
  home_returning_ppa, away_returning_ppa, home_returning_percent, away_returning_percent,
  home_avg_ppa_off_overall, home_avg_ppa_def_overall, away_avg_ppa_off_overall, away_avg_ppa_def_overall,
  home_avg_off_success, home_avg_def_success, away_avg_off_success, away_avg_def_success,
  home_avg_off_explosiveness, home_avg_def_explosiveness, away_avg_off_explosiveness, away_avg_def_explosiveness,
  home_avg_points_for, home_avg_points_against, home_avg_margin,
  away_avg_points_for, away_avg_points_against, away_avg_margin,
  home_games_played_ytd, away_games_played_ytd, home_rest_days, away_rest_days
`

const pool = makePool()
const q = async (s, p = []) => (await pool.query(s, p)).rows
try {
  // 1) What columns does hist_training_rows actually have?
  const cols = await q(`select column_name from information_schema.columns where table_name='hist_training_rows' order by column_name`)
  const colset = new Set(cols.map((c) => c.column_name))
  console.log("has home_elo_pregame?", colset.has("home_elo_pregame"), "| has elo_diff?", colset.has("elo_diff"), "| has market_spread?", colset.has("market_spread"))

  // 2) Season coverage.
  const seasons = await q(`select season, count(*)::int n from hist_training_rows group by season order by season`)
  console.log("seasons:", seasons.map((s) => `${s.season}:${s.n}`).join(" "))

  // 3) Pull a few rows via the EXACT capture FEATURE_SELECT (latest season).
  const latest = seasons[seasons.length - 1]?.season
  const rows = await q(`select ${FEATURE_SELECT} from hist_training_rows where season=$1 and both_fbs=true order by "startDate" limit 3`, [latest])
  console.log(`\ntracing ${rows.length} rows from season ${latest} via capture FEATURE_SELECT:`)
  for (const r of rows) {
    const keys = Object.keys(r)
    const hasEloRaw = "home_elo_pregame" in r
    const v = validateServingRow(r)
    let edge = null
    try { edge = scoreFrozen(loadFrozenArtifact(), r).edge } catch (e) { edge = "ERR:" + e.message }
    console.log(`  ${r.awayTeam} @ ${r.homeTeam}: home_elo_pregame in row? ${hasEloRaw} | elo_diff col=${r.elo_diff} | guard.ok=${v.ok} reason=${v.reason ?? "-"} | edge=${edge}`)
  }
} finally {
  await pool.end()
}
