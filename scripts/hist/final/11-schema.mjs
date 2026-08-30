import { makePool } from "../lib.mjs"

/**
 * Phase-FINAL schema: shadow-validation tables.
 *
 * Design goals (from the closeout spec):
 *  - IMMUTABILITY: a signal, once written, is never changed by later results.
 *    Enforced with a trigger that blocks UPDATE/DELETE on bse_shadow_signal.
 *    Grading writes to a SEPARATE table (bse_shadow_grade).
 *  - DEDUP: one signal per (model_hash, cfbd_game_id). Unique constraint +
 *    ON CONFLICT DO NOTHING in the capture job => re-runs never duplicate.
 *  - AUDITABILITY: signals store full provenance (feature snapshot, model hash,
 *    DraftKings line + snapshot timestamp, kickoff) so any decision is
 *    reproducible and provably recorded before kickoff.
 *
 * Column names here are the single source of truth and match
 * 12-capture-signals.mjs / 13-grade.mjs exactly.
 */
async function main() {
  const pool = makePool()
  const run = (s) => pool.query(s)
  const rows = async (s) => (await pool.query(s)).rows

  // ---- One-time reconcile: an earlier draft created these tables with
  // different column names. They hold NO real data yet, so if a signal count of
  // zero is observed we drop + recreate with the final schema. If any real
  // signal exists we REFUSE to drop (protects live shadow data).
  const exists = (
    await rows(`select to_regclass('public.bse_shadow_signal') is not null as e`)
  )[0].e
  if (exists) {
    const n = (await rows(`select count(*)::int c from bse_shadow_signal`))[0].c
    if (n > 0) {
      throw new Error(`REFUSING to reset schema: bse_shadow_signal already has ${n} real signals.`)
    }
    // Drop the named immutability trigger (if present) before dropping tables.
    await run(`drop trigger if exists trg_shadow_signal_immutable on bse_shadow_signal`).catch(() => {})
    await run(`drop table if exists bse_shadow_grade`)
    await run(`drop table if exists bse_shadow_signal`)
    await run(`drop table if exists bse_dk_snapshot`)
    console.log("reconciled: dropped empty draft tables, recreating with final schema.")
  }

  // ---- Immutable shadow signals -------------------------------------------
  await run(`
    create table if not exists bse_shadow_signal (
      id                          bigserial primary key,
      model_hash                  text not null,
      candidate_id                text not null,
      cfbd_game_id                text not null,
      season                      int  not null,
      week                        int  not null,
      season_type                 text not null,
      home_team                   text not null,
      away_team                   text not null,
      kickoff_at                  timestamptz,
      -- decision (side is HOME/AWAY lowercased 'home'/'away')
      side                        text not null check (side in ('home','away')),
      predicted_edge              double precision not null,   -- signed residual (points)
      market_implied_home_margin  double precision,            -- -signal_line_spread_home
      -- DraftKings line AT SIGNAL TIME (the grading baseline)
      signal_line_spread_home     double precision not null,   -- home-relative spread
      signal_line_spread_side     double precision not null,   -- spread from OUR side's view
      signal_line_price           int,                         -- price for our side
      signal_book                 text not null default 'draftkings',
      signal_line_at              timestamptz not null,        -- DK snapshot time (pre-kickoff)
      -- provenance
      feature_snapshot            jsonb not null,              -- exact features fed to the model
      dk_snapshot_at              timestamptz not null,
      captured_at                 timestamptz not null default now()
    )`)
  await run(`create unique index if not exists uq_shadow_signal on bse_shadow_signal (model_hash, cfbd_game_id)`)
  await run(`create index if not exists ix_shadow_signal_season_week on bse_shadow_signal (season, week)`)

  // Immutability trigger: block UPDATE and DELETE entirely on signals.
  await run(`
    create or replace function bse_block_signal_mutation() returns trigger as $$
    begin
      raise exception 'bse_shadow_signal is immutable: % not allowed', tg_op;
    end;
    $$ language plpgsql`)
  await run(`drop trigger if exists trg_shadow_signal_immutable on bse_shadow_signal`)
  await run(`
    create trigger trg_shadow_signal_immutable
      before update or delete on bse_shadow_signal
      for each row execute function bse_block_signal_mutation()`)

  // ---- Rolling DraftKings snapshots for tracked games ---------------------
  // Populated opportunistically from the SAME Blob snapshot the Board already
  // maintains (no new SGO poll). Gives us finalPregameLine at grade time.
  await run(`
    create table if not exists bse_dk_snapshot (
      id             bigserial primary key,
      cfbd_game_id   text not null,
      observed_at    timestamptz not null,      -- DK snapshot time
      kickoff_at     timestamptz,
      spread_home    double precision not null,
      price_home     int,
      price_away     int,
      is_pre_kickoff boolean not null,          -- observed_at < kickoff (time-safe)
      source         text not null default 'sgo-draftkings',
      created_at     timestamptz not null default now()
    )`)
  await run(`create unique index if not exists uq_dk_snapshot on bse_dk_snapshot (cfbd_game_id, observed_at, spread_home)`)
  await run(`create index if not exists ix_dk_snapshot_game on bse_dk_snapshot (cfbd_game_id, observed_at)`)

  // ---- Mutable grades — SEPARATE so results never rewrite decisions -------
  await run(`
    create table if not exists bse_shadow_grade (
      signal_id                 bigint primary key references bse_shadow_signal(id),
      graded_at                 timestamptz not null default now(),
      home_points               int not null,
      away_points               int not null,
      actual_margin             int not null,               -- home - away
      -- ATS graded at the SIGNAL line, from our side's perspective
      ats_result                text not null check (ats_result in ('WIN','LOSS','PUSH')),
      ats_cover_margin          double precision not null,
      -- CLV vs the last pre-kickoff DK line
      final_pregame_spread_home double precision,
      final_pregame_line_at     timestamptz,
      clv_points                double precision,           -- signed: + == moved toward our side
      has_clv                   boolean not null default false
    )`)

  console.log("Phase-FINAL shadow schema ready:")
  console.log("  bse_shadow_signal (immutable) | bse_dk_snapshot | bse_shadow_grade")
  console.log("  (bse_frozen_candidate created by 10-freeze.mjs)")
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
