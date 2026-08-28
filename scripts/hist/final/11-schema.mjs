import { makePool } from "../lib.mjs"

/**
 * Phase-FINAL schema: shadow-validation tables.
 *
 * Design goals (from the closeout spec):
 *  - IMMUTABILITY: a signal, once written, is never changed by later results.
 *    Enforced with a trigger that blocks UPDATE/DELETE on the immutable columns
 *    of bse_shadow_signal. Grading writes to a SEPARATE table.
 *  - DEDUP: one signal per (candidate, game). Enforced by a unique index.
 *  - AUDITABILITY: signals store full provenance (features hash, model hash,
 *    DraftKings snapshot, timestamps, kickoff) so any decision is reproducible
 *    and provably recorded before kickoff.
 */
async function main() {
  const pool = makePool()

  // Frozen-candidate registry (already created by the freeze step, but ensure).
  await pool.query(`
    create table if not exists bse_frozen_candidate (
      candidate_id text primary key,
      model_hash   text not null,
      frozen_at    timestamptz not null,
      artifact     jsonb not null
    )`)

  // Immutable shadow signals. One row per (candidate_id, cfbd_game_id).
  await pool.query(`
    create table if not exists bse_shadow_signal (
      id              bigserial primary key,
      candidate_id    text not null,
      model_hash      text not null,
      cfbd_game_id    bigint not null,
      season          int  not null,
      week            int  not null,
      home_team       text not null,
      away_team       text not null,
      kickoff         timestamptz not null,
      -- decision
      side            text not null check (side in ('HOME','AWAY')),
      predicted_edge  double precision not null,   -- signed model residual (points)
      -- DraftKings line AT SIGNAL TIME (grading baseline)
      sportsbook      text not null default 'DraftKings',
      signal_spread_home double precision not null, -- home spread (home favored = negative)
      signal_price_home  int,
      signal_price_away  int,
      signal_line_at  timestamptz not null,         -- when that DK line was observed
      -- provenance
      feature_snapshot jsonb not null,              -- the 17 features fed to the model
      created_at      timestamptz not null default now(),
      -- guarantee the record existed before kickoff
      constraint signal_before_kickoff check (created_at < kickoff)
    )`)
  await pool.query(`create unique index if not exists uq_shadow_signal on bse_shadow_signal (candidate_id, cfbd_game_id)`)

  // Immutability trigger: block UPDATE and DELETE entirely on signals.
  await pool.query(`
    create or replace function bse_block_signal_mutation() returns trigger as $$
    begin
      raise exception 'bse_shadow_signal is immutable: % not allowed', tg_op;
    end;
    $$ language plpgsql`)
  await pool.query(`drop trigger if exists trg_shadow_signal_immutable on bse_shadow_signal`)
  await pool.query(`
    create trigger trg_shadow_signal_immutable
      before update or delete on bse_shadow_signal
      for each row execute function bse_block_signal_mutation()`)

  // Rolling DraftKings snapshots for tracked games (reused from existing odds
  // refresh; NOT a new poll). Used to derive finalPregameLine at grade time.
  await pool.query(`
    create table if not exists bse_dk_snapshot (
      id           bigserial primary key,
      cfbd_game_id bigint not null,
      observed_at  timestamptz not null,      -- when DK showed this line
      kickoff      timestamptz not null,
      spread_home  double precision not null,
      price_home   int,
      price_away   int,
      is_pre_kickoff boolean not null,        -- observed_at < kickoff  (time-safe flag)
      source       text not null default 'sgo-draftkings',
      created_at   timestamptz not null default now()
    )`)
  // Dedup identical snapshots (same game, same observed_at, same line).
  await pool.query(`create unique index if not exists uq_dk_snapshot on bse_dk_snapshot (cfbd_game_id, observed_at, spread_home)`)
  await pool.query(`create index if not exists ix_dk_snapshot_game on bse_dk_snapshot (cfbd_game_id, observed_at)`)

  // Mutable grades — SEPARATE from signals so results never rewrite decisions.
  await pool.query(`
    create table if not exists bse_shadow_grade (
      signal_id       bigint primary key references bse_shadow_signal(id),
      graded_at       timestamptz not null default now(),
      home_points     int not null,
      away_points     int not null,
      actual_margin   int not null,             -- home - away
      -- ATS at signal line
      ats_result      text not null check (ats_result in ('WIN','LOSS','PUSH')),
      ats_cover_margin double precision not null,
      -- CLV vs final pre-kickoff DK line
      final_pregame_spread_home double precision,
      final_pregame_line_at     timestamptz,
      clv_points      double precision,          -- signed: + == line moved toward our side
      has_clv         boolean not null default false
    )`)

  console.log("Phase-FINAL shadow schema ready:")
  console.log("  bse_frozen_candidate, bse_shadow_signal (immutable), bse_dk_snapshot, bse_shadow_grade")
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
