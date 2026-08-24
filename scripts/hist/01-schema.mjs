// ---------------------------------------------------------------------------
// Stage 1 — create the historical archive schema. Idempotent + rerunnable.
//
// RAW source tables (hist_raw_*) hold CFBD data verbatim and are kept strictly
// SEPARATE from the derived feature table (hist_training_rows). Reconstruction
// reads raw, never the reverse. Nothing here is used by app runtime yet.
// ---------------------------------------------------------------------------

import { makePool } from "./lib.mjs"

const DDL = [
  // ---- Ingest / audit log (also the CFBD request ledger) ------------------
  `CREATE TABLE IF NOT EXISTS hist_ingest_runs (
     id serial PRIMARY KEY,
     dataset text NOT NULL,
     season integer,
     "seasonType" text,
     requests integer NOT NULL DEFAULT 0,
     "rowsUpserted" integer NOT NULL DEFAULT 0,
     status text NOT NULL DEFAULT 'ok',
     note text,
     "startedAt" timestamptz NOT NULL DEFAULT now(),
     "finishedAt" timestamptz
   )`,

  // ---- RAW: games (schedule spine + final scores + pregame/postgame elo) ---
  `CREATE TABLE IF NOT EXISTS hist_raw_games (
     "gameId" bigint PRIMARY KEY,
     season integer NOT NULL,
     week integer,
     "seasonType" text NOT NULL,
     "startDate" timestamptz,
     "startTimeTBD" boolean,
     completed boolean,
     "neutralSite" boolean,
     "conferenceGame" boolean,
     "venueId" integer,
     "homeTeam" text,
     "homeConference" text,
     "homeClassification" text,
     "homePoints" integer,
     "awayTeam" text,
     "awayConference" text,
     "awayClassification" text,
     "awayPoints" integer,
     "homePregameElo" integer,
     "awayPregameElo" integer,
     "homePostgameElo" integer,
     "awayPostgameElo" integer,
     raw jsonb NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS hist_raw_games_season_idx ON hist_raw_games (season, "seasonType")`,
  `CREATE INDEX IF NOT EXISTS hist_raw_games_home_idx ON hist_raw_games (season, "homeTeam")`,
  `CREATE INDEX IF NOT EXISTS hist_raw_games_away_idx ON hist_raw_games (season, "awayTeam")`,

  // ---- RAW: betting lines (per game per book) -----------------------------
  // CFBD semantics preserved: `spread`/`overUnder` = last-recorded value
  // (NOT a verified closing line); `*Open` = opening line.
  `CREATE TABLE IF NOT EXISTS hist_raw_lines (
     "gameId" bigint NOT NULL,
     season integer NOT NULL,
     week integer,
     "seasonType" text NOT NULL,
     provider text NOT NULL,
     spread double precision,
     "spreadOpen" double precision,
     "overUnder" double precision,
     "overUnderOpen" double precision,
     "homeMoneyline" integer,
     "awayMoneyline" integer,
     raw jsonb NOT NULL,
     PRIMARY KEY ("gameId", provider)
   )`,

  // ---- RAW: advanced game stats (per game per team) -----------------------
  `CREATE TABLE IF NOT EXISTS hist_raw_advanced (
     "gameId" bigint NOT NULL,
     season integer NOT NULL,
     week integer,
     team text NOT NULL,
     opponent text,
     off_ppa double precision,
     off_success_rate double precision,
     off_explosiveness double precision,
     def_ppa double precision,
     def_success_rate double precision,
     def_explosiveness double precision,
     raw jsonb NOT NULL,
     PRIMARY KEY ("gameId", team)
   )`,

  // ---- RAW: PPA/EPA games (per game per team) -----------------------------
  `CREATE TABLE IF NOT EXISTS hist_raw_ppa (
     "gameId" bigint NOT NULL,
     season integer NOT NULL,
     week integer,
     team text NOT NULL,
     opponent text,
     off_overall double precision,
     def_overall double precision,
     raw jsonb NOT NULL,
     PRIMARY KEY ("gameId", team)
   )`,

  // ---- RAW: preseason-safe annual team features ---------------------------
  `CREATE TABLE IF NOT EXISTS hist_raw_talent (
     season integer NOT NULL, team text NOT NULL, talent double precision,
     PRIMARY KEY (season, team)
   )`,
  `CREATE TABLE IF NOT EXISTS hist_raw_recruiting (
     season integer NOT NULL, team text NOT NULL, rank integer, points double precision,
     PRIMARY KEY (season, team)
   )`,
  `CREATE TABLE IF NOT EXISTS hist_raw_returning (
     season integer NOT NULL, team text NOT NULL,
     total_ppa double precision, percent_ppa double precision, raw jsonb,
     PRIMARY KEY (season, team)
   )`,

  // ---- RAW: end-of-season ratings (used ONLY as prior-season priors) ------
  `CREATE TABLE IF NOT EXISTS hist_raw_sp (
     season integer NOT NULL, team text NOT NULL,
     rating double precision, offense double precision, defense double precision, "specialTeams" double precision,
     PRIMARY KEY (season, team)
   )`,
  `CREATE TABLE IF NOT EXISTS hist_raw_srs (
     season integer NOT NULL, team text NOT NULL, rating double precision,
     PRIMARY KEY (season, team)
   )`,
  `CREATE TABLE IF NOT EXISTS hist_raw_fpi (
     season integer NOT NULL, team text NOT NULL, fpi double precision,
     PRIMARY KEY (season, team)
   )`,

  // ---- DERIVED: one row per completed game, as-of pregame features + label -
  `CREATE TABLE IF NOT EXISTS hist_training_rows (
     "gameId" bigint PRIMARY KEY,
     season integer NOT NULL,
     week integer,
     "seasonType" text NOT NULL,
     "startDate" timestamptz,
     is_anomalous_season boolean NOT NULL DEFAULT false,
     neutral_site boolean,
     conference_game boolean,
     both_fbs boolean,
     "homeTeam" text NOT NULL,
     "awayTeam" text NOT NULL,

     -- Pregame (as-of) HOME features
     home_elo_pregame integer,
     home_talent double precision,
     home_recruiting_points double precision,
     home_recruiting_rank integer,
     home_returning_ppa double precision,
     home_returning_percent double precision,
     home_prior_sp double precision,
     home_prior_srs double precision,
     home_prior_fpi double precision,
     home_games_played_ytd integer,
     home_rest_days integer,
     home_avg_off_ppa double precision,
     home_avg_def_ppa double precision,
     home_avg_off_success double precision,
     home_avg_def_success double precision,
     home_avg_off_explosiveness double precision,
     home_avg_def_explosiveness double precision,
     home_avg_ppa_off_overall double precision,
     home_avg_ppa_def_overall double precision,
     home_avg_points_for double precision,
     home_avg_points_against double precision,
     home_avg_margin double precision,

     -- Pregame (as-of) AWAY features
     away_elo_pregame integer,
     away_talent double precision,
     away_recruiting_points double precision,
     away_recruiting_rank integer,
     away_returning_ppa double precision,
     away_returning_percent double precision,
     away_prior_sp double precision,
     away_prior_srs double precision,
     away_prior_fpi double precision,
     away_games_played_ytd integer,
     away_rest_days integer,
     away_avg_off_ppa double precision,
     away_avg_def_ppa double precision,
     away_avg_off_success double precision,
     away_avg_def_success double precision,
     away_avg_off_explosiveness double precision,
     away_avg_def_explosiveness double precision,
     away_avg_ppa_off_overall double precision,
     away_avg_ppa_def_overall double precision,
     away_avg_points_for double precision,
     away_avg_points_against double precision,
     away_avg_margin double precision,

     -- Contextual diffs (derived from pregame values only)
     elo_diff integer,
     talent_diff double precision,

     -- Historical market (CFBD semantics preserved; NOT a verified close)
     market_provider text,
     market_spread double precision,       -- last-recorded spread (home negative = favored)
     market_spread_open double precision,   -- opening spread
     market_over_under double precision,
     market_over_under_open double precision,
     market_home_ml integer,
     market_away_ml integer,
     market_note text,

     -- Label / outcome (NEVER an input to this game's prediction)
     home_points integer,
     away_points integer,
     actual_margin integer,

     feature_version text NOT NULL,
     generated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS hist_training_rows_season_idx ON hist_training_rows (season, "seasonType")`,
]

async function main() {
  const pool = makePool()
  try {
    for (const stmt of DDL) {
      await pool.query(stmt)
    }
    console.log(`Schema ready: ${DDL.length} statements applied (idempotent).`)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error("SCHEMA ERROR:", e.message)
  process.exit(1)
})
