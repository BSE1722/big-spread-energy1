/**
 * bse_board_signal — CUSTOMER-FACING display cache for the frozen model's
 * per-game read on the Board and breakdown.
 *
 * This is DELIBERATELY separate from bse_shadow_signal:
 *   - bse_shadow_signal  = immutable, before-kickoff audit record (validation).
 *                          Never updated. Fires only when |edge| >= 1.
 *   - bse_board_signal   = MUTABLE display cache for EVERY eligible game, so the
 *                          Board can show a rating/lean on each matchup. Rescored
 *                          and upserted as lines move. Holds ONLY prediction
 *                          fields — NEVER ATS/CLV/grades (no validation leakage).
 *
 * The Board/breakdown TS APIs read this table (via lib/board-signal/service.ts)
 * and merge by cfbd game id. When no row exists, the UI shows "— / No rating".
 */

import { makePool } from "../lib.mjs"

async function main() {
  const pool = makePool()
  const run = (s) => pool.query(s)

  await run(`
    create table if not exists bse_board_signal (
      model_hash          text        not null,
      cfbd_game_id        text        not null,
      season              int         not null,
      week                int         not null,
      season_type         text        not null default 'regular',
      home_team           text        not null,
      away_team           text        not null,
      -- Model read (prediction fields ONLY — no grades):
      edge                double precision not null,       -- predicted home margin − market implied
      fair_home_margin    double precision,                -- predicted home margin
      market_spread_home  double precision,                -- line the score used (home-relative)
      lean                text        not null,            -- 'home' | 'away' | 'none'
      qualifies           boolean     not null,            -- |edge| >= threshold
      feature_complete    boolean     not null default true,
      scored_at           timestamptz not null default now(),
      primary key (model_hash, cfbd_game_id)
    )
  `)

  // Fast lookup for a given season/week board render.
  await run(`
    create index if not exists idx_board_signal_week
      on bse_board_signal (model_hash, season, week)
  `)

  console.log("bse_board_signal ready (mutable display cache; prediction fields only).")
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
