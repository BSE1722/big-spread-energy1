// ---------------------------------------------------------------------------
// FROZEN-MODEL CAPTURE CORE  (shared, single source of truth)
//
// This module contains the EXACT capture algorithm that was previously inlined
// in 12-capture-signals.mjs. It is imported by BOTH:
//   * scripts/hist/final/12-capture-signals.mjs   (CLI, unchanged behavior)
//   * app/api/admin/generate-ratings/route.ts      (Admin "Generate BSE Ratings")
//
// There is deliberately ONE implementation so the Admin button and the CLI
// produce byte-identical results. It NEVER trains, tunes, or replaces the frozen
// model — it only scores the frozen artifact and writes the mutable board
// display cache (bse_board_signal, upsert) + the IMMUTABLE shadow audit
// (bse_shadow_signal, insert ON CONFLICT DO NOTHING). All hard leakage/validity
// guards are preserved exactly.
//
// The caller supplies:
//   q         async (sql, params) => rows     (pg pool.query rows)
//   artifact  the frozen candidate (loadFrozenArtifact())
//   snapshot  the DraftKings snapshot ({ snapshotAt, games[] }) — SAME shape from
//             both the app's loadSnapshot() and the CLI's blob reader
//   season    number (required)
//   week      RAW provider week (optional; omitted = whole season)
//   now       Date (defaults to new Date()) — the capture instant
//   maxSnapshotAgeHours  fail-closed staleness threshold (default 48)
//
// It returns a structured summary (no console output) so the CLI can print it
// and the Admin route can render it. This adds ZERO external API calls.
// ---------------------------------------------------------------------------

import { scoreFrozen, validateServingRow } from "./score-frozen.mjs"

export const DEFAULT_MAX_SNAPSHOT_AGE_HOURS = 48

// RAW columns the FROZEN feature transform (features5.mjs DERIVED map) reads to
// build the 17 model features. The scorer + validity guard recompute every
// differential from these raw home/away inputs, so we MUST select the raw
// inputs, not precomputed diffs. This mirrors the SAME reconstruction used for
// 2015-2023 training (03-reconstruct.mjs) and is verified by parity.
export const FEATURE_SELECT = `
  "gameId", season, week, "seasonType", "startDate",
  "homeTeam", "awayTeam", both_fbs, neutral_site, market_spread,
  home_elo_pregame, away_elo_pregame,
  home_talent, away_talent,
  home_prior_sp, away_prior_sp, home_prior_srs, away_prior_srs, home_prior_fpi, away_prior_fpi,
  home_recruiting_points, away_recruiting_points,
  home_returning_ppa, away_returning_ppa, home_returning_percent, away_returning_percent,
  home_avg_off_ppa, home_avg_def_ppa, away_avg_off_ppa, away_avg_def_ppa,
  home_avg_ppa_off_overall, home_avg_ppa_def_overall, away_avg_ppa_off_overall, away_avg_ppa_def_overall,
  home_avg_off_success, home_avg_def_success, away_avg_off_success, away_avg_def_success,
  home_avg_off_explosiveness, home_avg_def_explosiveness, away_avg_off_explosiveness, away_avg_def_explosiveness,
  home_avg_points_for, home_avg_points_against, home_avg_margin,
  away_avg_points_for, away_avg_points_against, away_avg_margin,
  home_games_played_ytd, away_games_played_ytd, home_rest_days, away_rest_days
`

/** Normalize CFBD ids to the bare numeric form (snapshot uses "cfbd-<id>"). */
export const normId = (v) => String(v).replace(/^cfbd-/, "")

/** Thrown when the capture cannot run safely (fail closed). */
export class CaptureError extends Error {
  constructor(message) {
    super(message)
    this.name = "CaptureError"
  }
}

/**
 * Run the frozen-model capture for one season/(raw)week. Pure w.r.t. the model;
 * writes only the display cache + immutable shadow audit. Returns a summary.
 */
export async function runCapture({
  q,
  artifact,
  snapshot,
  season,
  week,
  now = new Date(),
  maxSnapshotAgeHours = DEFAULT_MAX_SNAPSHOT_AGE_HOURS,
}) {
  if (typeof q !== "function") throw new CaptureError("runCapture requires a query function `q`.")
  if (!artifact) throw new CaptureError("runCapture requires the frozen `artifact`.")
  if (!Number.isFinite(season)) throw new CaptureError("runCapture requires a numeric `season`.")
  if (!snapshot) {
    throw new CaptureError("No DraftKings snapshot available. Run the odds refresh first; no signals captured.")
  }

  const nowMs = now.getTime()
  const nowIso = now.toISOString()

  // Fail-closed staleness guard: refuse to attach a stale line.
  const snapAgeHours = (nowMs - new Date(snapshot.snapshotAt).getTime()) / 3.6e6
  if (!Number.isFinite(snapAgeHours) || snapAgeHours < 0) {
    throw new CaptureError(`DK snapshot timestamp is invalid (${snapshot.snapshotAt}); refusing to capture.`)
  }
  if (snapAgeHours > maxSnapshotAgeHours) {
    throw new CaptureError(
      `DK snapshot is stale: ${snapAgeHours.toFixed(1)}h old (> ${maxSnapshotAgeHours}h). ` +
        `Refresh odds before capturing; no signals written (fail closed).`,
    )
  }

  // Index usable DK spreads by bare cfbd id.
  const dkByCfbd = new Map()
  for (const g of snapshot.games) {
    if (g.oddsStatus === "matched" && g.market?.available && g.market.spread?.home != null) {
      dkByCfbd.set(normId(g.cfbdId), g)
    }
  }

  // Load frozen features for the target season/(raw)week. `week` here is the RAW
  // provider week as stored in hist_training_rows.
  const params = [season]
  let where = `season = $1 and both_fbs = true`
  if (week != null && Number.isFinite(Number(week))) {
    params.push(Number(week))
    where += ` and week = $2`
  }
  const rows = await q(
    `select ${FEATURE_SELECT} from hist_training_rows where ${where} order by "startDate"`,
    params,
  )

  const summary = {
    modelHash: artifact.modelHash,
    snapshotAt: snapshot.snapshotAt,
    snapshotAgeHours: Number(snapAgeHours.toFixed(2)),
    featureRows: rows.length,
    evaluated: 0,
    fired: 0,
    inserted: 0,
    skippedNoLine: 0,
    skippedStarted: 0,
    skippedDup: 0,
    skippedInvalid: 0,
    snapsRecorded: 0,
    invalid: [], // [{ gameId, matchup, reason }]
    started: [], // [{ gameId, matchup }]
    addedExternalApiCalls: 0,
  }

  for (const r of rows) {
    const matchup = `${r.awayTeam} @ ${r.homeTeam}`
    const dk = dkByCfbd.get(normId(r.gameId))
    if (!dk) {
      summary.skippedNoLine++
      continue
    }

    // Leakage guard: only capture BEFORE kickoff.
    const kickoff = r.startDate
      ? new Date(r.startDate).getTime()
      : dk.kickoff
        ? new Date(dk.kickoff).getTime()
        : null
    if (kickoff != null && kickoff <= nowMs) {
      summary.skippedStarted++
      summary.started.push({ gameId: String(r.gameId), matchup })
      continue
    }

    // Fail-closed validity guard: never score/write from a row whose real inputs
    // are missing or corrupt (would manufacture a prediction from medians).
    const valid = validateServingRow(r)
    if (!valid.ok) {
      summary.skippedInvalid++
      summary.invalid.push({ gameId: String(r.gameId), matchup, reason: valid.reason })
      continue
    }

    summary.evaluated++
    const { edge, fires, side } = scoreFrozen(artifact, r)

    const boardGameId = `cfbd-${normId(r.gameId)}`
    const dkSpreadHome = dk.market.spread.home
    const marketImpliedHome = -dkSpreadHome
    const fairHomeMargin = marketImpliedHome + edge

    // CUSTOMER BOARD display row (MUTABLE) — write for EVERY valid game so the
    // Board can render a rating/lean on each matchup. Upsert to track line moves.
    await q(
      `insert into bse_board_signal
        (model_hash, cfbd_game_id, season, week, season_type, home_team, away_team,
         edge, fair_home_margin, market_spread_home, lean, qualifies, feature_complete, scored_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (model_hash, cfbd_game_id) do update set
         edge = excluded.edge,
         fair_home_margin = excluded.fair_home_margin,
         market_spread_home = excluded.market_spread_home,
         lean = excluded.lean,
         qualifies = excluded.qualifies,
         feature_complete = excluded.feature_complete,
         season = excluded.season, week = excluded.week, season_type = excluded.season_type,
         home_team = excluded.home_team, away_team = excluded.away_team,
         scored_at = excluded.scored_at`,
      [
        artifact.modelHash, boardGameId, r.season, r.week, r.seasonType,
        r.homeTeam, r.awayTeam,
        edge, fairHomeMargin, dkSpreadHome, side ?? "none", fires, true, nowIso,
      ],
    )

    if (!fires) continue
    summary.fired++

    const dkPrice = side === "home" ? dk.market.spread.homePrice : dk.market.spread.awayPrice
    const dkSpreadForSide = side === "home" ? dkSpreadHome : -dkSpreadHome

    // IMMUTABLE signal. ON CONFLICT DO NOTHING => first pre-kickoff capture wins.
    const res = await q(
      `insert into bse_shadow_signal
        (model_hash, candidate_id, cfbd_game_id, season, week, season_type,
         home_team, away_team, kickoff_at,
         side, predicted_edge, market_implied_home_margin,
         signal_line_spread_home, signal_line_spread_side, signal_line_price, signal_book,
         signal_line_at, feature_snapshot, dk_snapshot_at, captured_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       on conflict (model_hash, cfbd_game_id) do nothing
       returning id`,
      [
        artifact.modelHash, artifact.candidateId, String(r.gameId), r.season, r.week, r.seasonType,
        r.homeTeam, r.awayTeam, r.startDate,
        side, edge, marketImpliedHome,
        dkSpreadHome, dkSpreadForSide, dkPrice ?? null, "draftkings",
        snapshot.snapshotAt, JSON.stringify(r), snapshot.snapshotAt, nowIso,
      ],
    )
    if (res.length) summary.inserted++
    else summary.skippedDup++
  }

  // Record DK snapshots for ALL games that have a live signal (preserves the
  // timestamped line for the grader). Reuses the SAME Blob snapshot (no new SGO).
  const tracked = await q(
    `select distinct cfbd_game_id, kickoff_at from bse_shadow_signal where model_hash = $1`,
    [artifact.modelHash],
  )
  const trackedIds = new Set(tracked.map((t) => String(t.cfbd_game_id)))
  for (const g of snapshot.games) {
    if (!trackedIds.has(String(normId(g.cfbdId)))) continue
    if (!(g.market?.available && g.market.spread?.home != null)) continue
    const kickoff = g.kickoff ? new Date(g.kickoff).getTime() : null
    const observedMs = new Date(snapshot.snapshotAt).getTime()
    const isPre = kickoff == null ? true : observedMs < kickoff
    const res = await q(
      `insert into bse_dk_snapshot
         (cfbd_game_id, observed_at, kickoff_at, spread_home, price_home, price_away, is_pre_kickoff, source)
       values ($1,$2,$3,$4,$5,$6,$7,'sgo-draftkings')
       on conflict (cfbd_game_id, observed_at, spread_home) do nothing
       returning id`,
      [
        String(normId(g.cfbdId)), snapshot.snapshotAt, g.kickoff ?? null, g.market.spread.home,
        g.market.spread.homePrice ?? null, g.market.spread.awayPrice ?? null, isPre,
      ],
    )
    if (res.length) summary.snapsRecorded++
  }

  return summary
}
