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
