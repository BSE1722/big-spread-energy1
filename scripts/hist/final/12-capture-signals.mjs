// ---------------------------------------------------------------------------
// FINAL PHASE — STEP 2: SHADOW SIGNAL CAPTURE  (weekly, pre-kickoff)
//
// For each eligible game in the target season/week, score the FROZEN candidate
// on the leakage-safe as-of features and, when |edge| >= 1, write an IMMUTABLE
// shadow signal. A shadow signal is NOT an Official BSE Pick — it is a logged,
// reproducible, before-kickoff decision used only for prospective validation.
//
// DATA SOURCES (cost-controlled):
//   * features  : hist_training_rows for the target season (the SAME leakage-
//                 safe as-of reconstruction used for 2015-2023). During 2026 the
//                 existing 02-backfill + 03-reconstruct jobs populate these rows
//                 from CFBD; this script adds ZERO new CFBD calls.
//   * DK line   : loadSnapshot() reads the durable Blob snapshot the Board
//                 already maintains — ZERO new SGO calls. We reuse whatever the
//                 admin's normal odds refresh last captured.
//
// LEAKAGE GUARDS (hard):
//   * Only games with kickoff STRICTLY in the future at capture time are eligible
//     (a signal must provably exist before kickoff). Past/started games skipped.
//   * The DK snapshot used is the CURRENT snapshot; its snapshotAt is stored as
//     the signal's signal_line_at so we can prove it predates kickoff.
//   * Outcomes (home_points/away_points) are NEVER read here.
//
// IMMUTABILITY / DEDUP:
//   * bse_shadow_signal has a UNIQUE(model_hash, cfbd_game_id) constraint and an
//     immutability trigger. Re-running NEVER updates or duplicates a signal
//     (ON CONFLICT DO NOTHING). The first pre-kickoff capture wins, forever.
//
// USAGE:
//   node scripts/hist/final/12-capture-signals.mjs --season 2026 --week 5
//   (season/week default to the app's current season context if omitted)
// ---------------------------------------------------------------------------

import { makePool } from "../lib.mjs"
import { loadFrozenArtifact, scoreFrozen, validateServingRow } from "./score-frozen.mjs"

// Fail-closed staleness threshold: if the newest DK snapshot is older than this
// (relative to now), the odds refresh has stalled and we refuse to capture
// rather than attach a stale line. Override with --max-snapshot-age-hours.
const DEFAULT_MAX_SNAPSHOT_AGE_HOURS = 48

// RAW columns the FROZEN feature transform (features5.mjs DERIVED map) reads to
// build the 17 model features. The scorer + validity guard recompute every
// differential from these raw home/away inputs (e.g. elo_diff from
// home_elo_pregame - away_elo_pregame), so we MUST select the raw inputs, not
// precomputed diffs — selecting `elo_diff`/`talent_diff` here leaves the raw
// columns absent, which median-imputes the two strongest features and makes the
// validity guard reject every game. This list mirrors the SAME reconstruction
// used for 2015-2023 training (03-reconstruct.mjs) and verified by parity.
const FEATURE_SELECT = `
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

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

async function main() {
  const artifact = loadFrozenArtifact()
  const season = Number(argVal("--season", process.env.BSE_SEASON))
  const weekArg = argVal("--week", process.env.BSE_WEEK)
  if (!Number.isFinite(season)) {
    console.error("Provide --season <year> (and optionally --week <n>).")
    process.exit(1)
  }

  const pool = makePool()
  const q = async (s, p = []) => (await pool.query(s, p)).rows
  const nowIso = new Date().toISOString()

  try {
    // --- Load the current DraftKings snapshot (Blob; zero SGO calls) --------
    // We import the app helper via a tiny node shim: the snapshot is a public
    // blob JSON, so we read it directly to avoid bundling app TS into a script.
    const snap = await loadDkSnapshotFromBlob()
    if (!snap) {
      console.error("No DraftKings snapshot available. Run the admin odds refresh first; no signals captured.")
      process.exit(1)
    }
    // Fail-closed staleness guard: refuse to attach a stale line.
    const maxAgeHours = Number(argVal("--max-snapshot-age-hours", DEFAULT_MAX_SNAPSHOT_AGE_HOURS))
    const snapAgeHours = (Date.now() - new Date(snap.snapshotAt).getTime()) / 3.6e6
    if (!Number.isFinite(snapAgeHours) || snapAgeHours < 0) {
      console.error(`DK snapshot timestamp is invalid (${snap.snapshotAt}); refusing to capture.`)
      process.exit(1)
    }
    if (snapAgeHours > maxAgeHours) {
      console.error(
        `DK snapshot is stale: ${snapAgeHours.toFixed(1)}h old (> ${maxAgeHours}h). ` +
          `Refresh odds before capturing; no signals written (fail closed).`,
      )
      process.exit(1)
    }
    console.log(`DK snapshot age: ${snapAgeHours.toFixed(1)}h (<= ${maxAgeHours}h ok).`)
    const dkByCfbd = new Map()
    for (const g of snap.games) {
      if (g.oddsStatus === "matched" && g.market?.available && g.market.spread?.home != null) {
        dkByCfbd.set(String(g.cfbdId), g)
      }
    }
    console.log(`DK snapshot @ ${snap.snapshotAt} — ${dkByCfbd.size} games with a usable spread.`)

    // --- Load frozen features for the target season/week --------------------
    const params = [season]
    let where = `season = $1 and both_fbs = true`
    if (weekArg) { params.push(Number(weekArg)); where += ` and week = $2` }
    const rows = await q(`select ${FEATURE_SELECT} from hist_training_rows where ${where} order by "startDate"`, params)
    console.log(`feature rows for season ${season}${weekArg ? ` week ${weekArg}` : ""}: ${rows.length}`)

    let evaluated = 0, fired = 0, inserted = 0, skippedNoLine = 0, skippedStarted = 0, skippedDup = 0, skippedInvalid = 0

    for (const r of rows) {
      const dk = dkByCfbd.get(String(r.gameId))
      if (!dk) { skippedNoLine++; continue }

      // Leakage guard: only capture BEFORE kickoff. If kickoff already passed,
      // we cannot prove the signal predated it — skip.
      const kickoff = r.startDate ? new Date(r.startDate).getTime() : (dk.kickoff ? new Date(dk.kickoff).getTime() : null)
      if (kickoff != null && kickoff <= Date.now()) { skippedStarted++; continue }

      // Fail-closed validity guard: never score/write a signal from a row whose
      // real inputs are missing or corrupt (would manufacture a prediction from
      // medians). Does not touch the frozen model — pure serving-side check.
      const valid = validateServingRow(r)
      if (!valid.ok) {
        skippedInvalid++
        console.warn(`SKIP game ${r.gameId} (${r.awayTeam} @ ${r.homeTeam}): ${valid.reason}`)
        continue
      }

      evaluated++
      const { edge, fires, side } = scoreFrozen(artifact, r)

      const dkSpreadHome = dk.market.spread.home            // home-relative spread
      const marketImpliedHome = -dkSpreadHome               // frozen convention
      const fairHomeMargin = marketImpliedHome + edge       // model's predicted home margin

      // --- CUSTOMER BOARD display row (MUTABLE) — write for EVERY valid game,
      // not just fired ones, so the Board can render a rating/lean on each
      // matchup. Prediction fields ONLY (no grades). Upsert so it tracks line
      // moves on rescore. Separate from the immutable shadow audit below.
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
          artifact.modelHash, String(r.gameId), r.season, r.week, r.seasonType,
          r.homeTeam, r.awayTeam,
          edge, fairHomeMargin, dkSpreadHome, side ?? "none", fires, true, nowIso,
        ],
      )

      if (!fires) continue
      fired++

      const dkPrice = side === "home" ? dk.market.spread.homePrice : dk.market.spread.awayPrice
      const dkSpreadForSide = side === "home" ? dkSpreadHome : -dkSpreadHome

      // Insert immutable signal. ON CONFLICT DO NOTHING guarantees the first
      // pre-kickoff capture is permanent and never rewritten.
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
          snap.snapshotAt, JSON.stringify(r), snap.snapshotAt, nowIso,
        ],
      )
      if (res.length) inserted++; else skippedDup++
    }

    // --- Record DK snapshots for ALL games that have a live signal ----------
    // This preserves the timestamped DraftKings line for tracked games so the
    // grader can later derive finalPregameLine. Reuses the SAME Blob snapshot
    // (no new SGO call). Dedup on (game, observed_at, spread) => reusing the
    // same odds refresh twice never creates redundant rows.
    let snapsRecorded = 0
    const tracked = await q(
      `select distinct cfbd_game_id, kickoff_at from bse_shadow_signal where model_hash = $1`,
      [artifact.modelHash],
    )
    const trackedIds = new Set(tracked.map((t) => String(t.cfbd_game_id)))
    for (const g of snap.games) {
      if (!trackedIds.has(String(g.cfbdId))) continue
      if (!(g.market?.available && g.market.spread?.home != null)) continue
      const kickoff = g.kickoff ? new Date(g.kickoff).getTime() : null
      const observedMs = new Date(snap.snapshotAt).getTime()
      const isPre = kickoff == null ? true : observedMs < kickoff
      const r = await q(
        `insert into bse_dk_snapshot
           (cfbd_game_id, observed_at, kickoff_at, spread_home, price_home, price_away, is_pre_kickoff, source)
         values ($1,$2,$3,$4,$5,$6,$7,'sgo-draftkings')
         on conflict (cfbd_game_id, observed_at, spread_home) do nothing
         returning id`,
        [String(g.cfbdId), snap.snapshotAt, g.kickoff ?? null, g.market.spread.home,
         g.market.spread.homePrice ?? null, g.market.spread.awayPrice ?? null, isPre],
      )
      if (r.length) snapsRecorded++
    }

    console.log(`\n=== CAPTURE SUMMARY (model ${artifact.modelHash.slice(0, 12)}) ===`)
    console.log(`DK snapshots recorded for tracked games  : ${snapsRecorded}`)
    console.log(`evaluated (pre-kickoff, DK line present): ${evaluated}`)
    console.log(`fired |edge|>=1                          : ${fired}`)
    console.log(`new immutable signals inserted           : ${inserted}`)
    console.log(`already existed (dedup, unchanged)       : ${skippedDup}`)
    console.log(`skipped — no DK line matched             : ${skippedNoLine}`)
    console.log(`skipped — kickoff already passed         : ${skippedStarted}`)
    console.log(`skipped — invalid/malformed features     : ${skippedInvalid}`)
    console.log(`board display rows upserted (all valid)  : ${evaluated}`)
    console.log(`\nADDED EXTERNAL API CALLS THIS RUN: 0 (features from DB, DK line from existing Blob snapshot)`)
  } finally {
    await pool.end()
  }
}

/**
 * Read the durable DraftKings snapshot straight from the public Blob JSON the
 * Board maintains. Uses the same pathname as lib/odds-snapshot.ts. This adds NO
 * SGO request — it only reads storage the admin refresh already wrote.
 */
async function loadDkSnapshotFromBlob() {
  try {
    const { list } = await import("@vercel/blob")
    const { blobs } = await list({ prefix: "odds/draftkings-snapshot.json" })
    const hit = blobs.find((b) => b.pathname === "odds/draftkings-snapshot.json")
    if (!hit) return null
    const res = await fetch(hit.url)
    if (!res.ok) return null
    return await res.json()
  } catch (e) {
    console.error("snapshot read failed:", e.message)
    return null
  }
}

main().catch((e) => {
  console.error("CAPTURE ERROR:", e.message, e.stack)
  process.exit(1)
})
