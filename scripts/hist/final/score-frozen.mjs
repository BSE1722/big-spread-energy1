/**
 * FROZEN CANDIDATE SCORER  —  BSE-final / shadow validation
 * ---------------------------------------------------------------------------
 * Loads the immutable Phase-final artifact (frozen-candidate.json) and scores a
 * single raw feature row, reproducing the EXACT Phase-5 Family-B math by
 * reusing the SAME code that produced the frozen candidate:
 *
 *   - transformRaw(...)  (scripts/hist/phase5/features5.mjs)  -> design row
 *   - gbtPredict(...)    (scripts/hist/phase5/ml5.mjs)        -> residual edge
 *
 * For family B:  edge = gbt(features) = predicted_home_margin - market_implied.
 *   FIRE + side=home  when edge >=  threshold
 *   FIRE + side=away  when edge <= -threshold
 *
 * This module NEVER trains, re-tunes, or reads game outcomes. It is a pure
 * function of (artifact, rawRow). Reusing the Phase-5 functions (rather than
 * re-implementing them) guarantees byte-identical scoring — verified against the
 * stored Phase-5 OOS predictions by verify-parity.mjs.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { transformRaw } from "../phase5/features5.mjs"
import { gbtPredict } from "../phase5/ml5.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACT_PATH = path.join(__dirname, "frozen-candidate.json")

let _artifact = null
/** Load + cache the immutable artifact from disk. */
export function loadFrozenArtifact() {
  if (!_artifact) _artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"))
  return _artifact
}

/** Reconstruct the { spec, model } objects the Phase-5 functions expect. */
function rehydrate(artifact) {
  const spec = {
    base: artifact.preprocess.base,
    missFlags: artifact.preprocess.missFlags,
    medians: artifact.preprocess.medians,
    columns: artifact.preprocess.columns,
    mean: artifact.preprocess.mean,
    stdv: artifact.preprocess.stdv,
  }
  const model = {
    base: artifact.gbt.base,
    learningRate: artifact.gbt.learningRate,
    edgesPerCol: artifact.gbt.edgesPerCol,
    trees: artifact.gbt.trees,
  }
  return { spec, model }
}

/**
 * Score ONE raw feature row (same column names as hist_training_rows) against
 * the frozen candidate. Returns { edge, fires, side }. Outcome-free + pure.
 */
export function scoreFrozen(artifact, rawRow) {
  const { spec, model } = rehydrate(artifact)
  // transformRaw expects an array of rows; design uses the frozen spec exactly.
  const X = transformRaw([rawRow], spec)
  const edge = gbtPredict(model, X)[0]
  const thr = artifact.threshold
  let side = null
  if (edge >= thr) side = "home"
  else if (edge <= -thr) side = "away"
  return { edge: Number(edge.toFixed(4)), fires: side != null, side }
}

// ---------------------------------------------------------------------------
// SERVING-SIDE VALIDITY GUARD (fail-closed). This does NOT alter scoreFrozen or
// the frozen artifact — parity is preserved. The model's median-imputation is
// correct for TRAINING, but at SERVE time we must never write a shadow signal
// from a row whose real inputs are missing or corrupt (that would be "betting
// on medians"). The capture job calls this BEFORE scoring and skips on !ok.
//
// Two independent checks, both grounded in the frozen training distribution:
//   MALFORMED  — a source column is PRESENT but not a finite number (NaN, a
//                string, Infinity). This is data corruption, always an error,
//                and distinct from a legitimately-absent value. The scorer's
//                num() guard silently turns these into null->median; here we
//                catch them and fail closed.
//   MISSING_CORE — the primary rating/talent signal cannot be computed. In the
//                6,719-row training set elo_diff and talent_diff are non-null in
//                100.0% of games, so requiring them rejects ZERO games the model
//                was trained on while guaranteeing the edge is anchored on real
//                signal (not imputed medians). Form/rest/SRS nulls are left
//                alone — those are legitimately sparse (week-1 openers) and the
//                frozen recipe imputes them exactly as in training.
// ---------------------------------------------------------------------------

// Numeric source columns that feed the 17 model features (+ market_spread).
const NUMERIC_SOURCE_COLUMNS = [
  "market_spread",
  "home_elo_pregame", "away_elo_pregame",
  "home_talent", "away_talent",
  "home_prior_sp", "away_prior_sp", "home_prior_srs", "away_prior_srs", "home_prior_fpi", "away_prior_fpi",
  "home_recruiting_points", "away_recruiting_points",
  "home_returning_ppa", "away_returning_ppa", "home_returning_percent", "away_returning_percent",
  "home_avg_off_ppa", "home_avg_def_ppa", "away_avg_off_ppa", "away_avg_def_ppa",
  "home_avg_ppa_off_overall", "home_avg_ppa_def_overall", "away_avg_ppa_off_overall", "away_avg_ppa_def_overall",
  "home_avg_off_success", "home_avg_def_success", "away_avg_off_success", "away_avg_def_success",
  "home_avg_off_explosiveness", "home_avg_def_explosiveness", "away_avg_off_explosiveness", "away_avg_def_explosiveness",
  "home_avg_margin", "away_avg_margin",
  "home_avg_points_for", "away_avg_points_for", "home_avg_points_against", "away_avg_points_against",
  "home_rest_days", "away_rest_days", "home_games_played_ytd", "away_games_played_ytd",
]

// Features that MUST be computable for a valid serve (100% present in training).
const REQUIRED_CORE_FEATURES = ["elo_diff", "talent_diff"]

/** Compute a core diff feature from home/away raw values (null if either absent). */
function coreDiff(row, homeCol, awayCol) {
  const h = row[homeCol]
  const a = row[awayCol]
  const hn = typeof h === "number" && Number.isFinite(h) ? h : null
  const an = typeof a === "number" && Number.isFinite(a) ? a : null
  return hn != null && an != null ? hn - an : null
}

/**
 * Validate a raw feature row for SERVING. Pure. Returns
 *   { ok, malformed: string[], missingCore: string[], reason: string|null }
 * ok === false means the capture job MUST skip this game (fail closed).
 */
export function validateServingRow(rawRow) {
  const malformed = []
  for (const col of NUMERIC_SOURCE_COLUMNS) {
    const v = rawRow[col]
    if (v === null || v === undefined) continue // legitimately absent — allowed
    if (typeof v !== "number" || !Number.isFinite(v)) malformed.push(col)
  }
  const missingCore = []
  if (coreDiff(rawRow, "home_elo_pregame", "away_elo_pregame") == null) missingCore.push("elo_diff")
  if (coreDiff(rawRow, "home_talent", "away_talent") == null) missingCore.push("talent_diff")

  const ok = malformed.length === 0 && missingCore.length === 0
  let reason = null
  if (malformed.length) reason = `malformed inputs: ${malformed.join(", ")}`
  else if (missingCore.length) reason = `missing core signal: ${missingCore.join(", ")}`
  return { ok, malformed, missingCore, reason }
}
