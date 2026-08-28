import { makePool } from "../lib.mjs"
const needed = [
  "home_elo_pregame","away_elo_pregame","home_talent","away_talent",
  "home_prior_sp","away_prior_sp","home_prior_srs","away_prior_srs","home_prior_fpi","away_prior_fpi",
  "home_recruiting_points","away_recruiting_points",
  "home_returning_ppa","away_returning_ppa","home_returning_percent","away_returning_percent",
  "home_avg_off_ppa","home_avg_def_ppa","away_avg_off_ppa","away_avg_def_ppa",
  "home_avg_off_success","home_avg_def_success","away_avg_off_success","away_avg_def_success",
  "home_avg_off_explosiveness","home_avg_def_explosiveness","away_avg_off_explosiveness","away_avg_def_explosiveness",
  "home_avg_ppa_off_overall","home_avg_ppa_def_overall","away_avg_ppa_off_overall","away_avg_ppa_def_overall",
  "home_avg_margin","away_avg_margin","home_avg_points_for","away_avg_points_for",
  "home_avg_points_against","away_avg_points_against",
  "home_rest_days","away_rest_days","home_games_played_ytd","away_games_played_ytd",
  "neutral_site","market_spread",
]
const pool = makePool()
try {
  const { rows } = await pool.query(`select column_name from information_schema.columns where table_name='hist_training_rows'`)
  const have = new Set(rows.map((r) => r.column_name))
  const missing = needed.filter((c) => !have.has(c))
  console.log("MISSING from hist_training_rows:", missing.length ? missing.join(", ") : "(none — all present)")
} finally { await pool.end() }
