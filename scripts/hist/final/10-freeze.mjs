// ---------------------------------------------------------------------------
// FINAL PHASE — STEP 1: FREEZE THE PROSPECTIVE CANDIDATE.
//
// Produces the ONE permanent, immutable scoring artifact for shadow validation:
//
//     family/model : B_residual::gbt          (market-residual GBT)
//     threshold    : |edge| >= 1              (edge == predicted residual)
//     features     : the 17 frozen non-market differentials + neutral_site
//     preprocess   : median-impute + missingness flags (fit on THIS train set)
//     hyperparams  : depth=3, learningRate=0.05, nTrees=52 (fold-5 selected)
//
// WHY A ONE-TIME REFIT IS REQUIRED (and is not "retraining"):
//   Phase 5 fit each fold's model in memory and persisted only OOS predictions +
//   the selected hyperparameters — never a serialized model. To score FUTURE
//   games we must materialize the trees ONCE. Per the operator's approved
//   deploy-freeze: fit on ALL non-anomalous 2015-2023 rows (2020 excluded from
//   fitting, matching the Phase-5 protocol) using the fold-5 hyperparameters
//   with nTrees FIXED at 52 (no early stopping, no grid, no re-tuning). This is
//   a mechanical materialization of an already-selected recipe, NOT a new search.
//
// KEY IDENTITY (verified below): for family B,
//     predicted_home_margin = market_implied + gbt(features)
//     edge = predicted_home_margin - market_implied = gbt(features)
//   => the edge / bet side depend ONLY on the 17 non-market features. The book's
//      line is what we bet INTO and grade AGAINST, never what creates the edge.
//
// This script is WRITE-ONCE. If the artifact already exists it refuses to
// overwrite unless FORCE_FREEZE=1 (guards the immutability contract).
// ---------------------------------------------------------------------------

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { makePool } from "../lib.mjs"
import { fitPreprocess, transformRaw, marketImplied, MODEL_FEATURES } from "../phase5/features5.mjs"
import { gbtFit, gbtPredict } from "../phase5/ml5.mjs"

const OUT_DIR = path.join(process.cwd(), "scripts", "hist", "final")
const ARTIFACT_PATH = path.join(OUT_DIR, "frozen-candidate.json")

// The approved frozen recipe. These are constants, not tunables.
const FREEZE = {
  family: "B_residual",
  model: "gbt",
  threshold: 1, // |edge| >= 1
  // fold-5 selected hyperparameters (see hist_phase5_predictions / tournament-run.json)
  hyperparams: { depth: 3, learningRate: 0.05, nTrees: 52 },
  // fixed structural knobs, identical to Phase-5 refitGbt (GRID.gbt.minLeaf / maxBins)
  minLeaf: 30,
  maxBins: 48,
  // training window: all archived seasons, 2020 excluded from FITTING
  trainSeasons: [2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023],
  featureVersion: "hist-v1",
}

/** Canonical JSON (sorted keys) so the hash is stable across runs. */
function canonical(obj) {
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]"
  if (obj && typeof obj === "object") {
    return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}"
  }
  return JSON.stringify(obj)
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex")

async function main() {
  if (fs.existsSync(ARTIFACT_PATH) && process.env.FORCE_FREEZE !== "1") {
    console.error(`REFUSING TO OVERWRITE frozen artifact at ${ARTIFACT_PATH}`)
    console.error("The candidate is already frozen and must be immutable. Set FORCE_FREEZE=1 only to (re)create it deliberately.")
    process.exit(1)
  }

  const pool = makePool()
  const q = async (s, p = []) => (await pool.query(s, p)).rows
  try {
    // Family B needs a market line (residual target) + a real label. 2020 excluded.
    const rows = (await q(`select * from hist_training_rows order by "startDate" nulls last, "gameId"`))
      .filter((r) => FREEZE.trainSeasons.includes(r.season) && !r.is_anomalous_season)
      .filter((r) => marketImplied(r) != null && r.actual_margin != null)

    console.log(`\n=== FREEZE: B_residual::gbt ===`)
    console.log(`training rows (2015-2023 excl 2020, market present): ${rows.length}`)
    const bySeason = {}
    for (const r of rows) bySeason[r.season] = (bySeason[r.season] ?? 0) + 1
    console.log("by season:", bySeason)

    // Preprocessing spec — fit on THIS training set only (market never a feature).
    const spec = fitPreprocess(rows)
    console.log(`\nfeature columns (${spec.columns.length}): ${spec.columns.join(", ")}`)

    // Residual target (family B) and raw design (tree models are scale-invariant).
    const target = (r) => r.actual_margin - marketImplied(r)
    const X = transformRaw(rows, spec)
    const y = rows.map(target)

    // Fit ONCE with fixed tree count (Xval=null => no early stopping => exactly nTrees).
    const model = gbtFit(X, y, null, null, {
      depth: FREEZE.hyperparams.depth,
      learningRate: FREEZE.hyperparams.learningRate,
      maxTrees: FREEZE.hyperparams.nTrees,
      minLeaf: FREEZE.minLeaf,
      maxBins: FREEZE.maxBins,
    })
    if (model.trees.length !== FREEZE.hyperparams.nTrees) {
      throw new Error(`Expected exactly ${FREEZE.hyperparams.nTrees} trees, got ${model.trees.length}`)
    }
    console.log(`\nfit complete: ${model.trees.length} trees, base=${model.base.toFixed(4)}, lr=${model.learningRate}`)

    // --- In-sample sanity (NOT a performance claim — fit data) --------------
    const resid = gbtPredict(model, X)
    let qualifying = 0
    let sumAbs = 0
    for (const e of resid) {
      sumAbs += Math.abs(e)
      if (Math.abs(e) >= FREEZE.threshold) qualifying++
    }
    console.log(
      `in-sample residual: mean|edge|=${(sumAbs / resid.length).toFixed(3)}, ` +
        `${qualifying}/${resid.length} (${((100 * qualifying) / resid.length).toFixed(1)}%) would fire |edge|>=1`,
    )

    // --- Build the immutable artifact --------------------------------------
    // `payload` (spec + model + recipe) is what the hash covers. Provenance
    // metadata (timestamps, git) is recorded but NOT hashed, so re-reading never
    // changes the identity hash.
    const payload = {
      candidateId: "B_residual::gbt|edge>=1",
      family: FREEZE.family,
      model: FREEZE.model,
      threshold: FREEZE.threshold,
      thresholdRule: "fire a shadow signal when |edge| >= 1; edge == predicted market residual (points)",
      featureVersion: FREEZE.featureVersion,
      modelFeatures: MODEL_FEATURES,
      trainSeasons: FREEZE.trainSeasons,
      hyperparams: FREEZE.hyperparams,
      minLeaf: FREEZE.minLeaf,
      maxBins: FREEZE.maxBins,
      // exact preprocessing spec (imputation medians, missingness flags, columns)
      preprocess: {
        base: spec.base,
        missFlags: spec.missFlags,
        medians: spec.medians,
        columns: spec.columns,
        // mean/stdv are only used by linear models; retained for completeness.
        mean: spec.mean,
        stdv: spec.stdv,
      },
      // serialized GBT (histogram trees): everything gbtPredict needs.
      gbt: {
        base: model.base,
        learningRate: model.learningRate,
        edgesPerCol: model.edgesPerCol,
        trees: model.trees,
        nTrees: model.trees.length,
      },
      scoring: {
        note: "residual = gbt(designRow(features)); predicted_home_margin = market_implied + residual; edge = residual.",
        marketImpliedHomeMargin: "-market_spread (home favored => spread<0 => positive)",
        betSide: "home if edge>0 else away; qualifies when |edge| >= threshold",
      },
    }
    const modelHash = sha(canonical(payload))

    const artifact = {
      ...payload,
      modelHash,
      frozenAt: new Date().toISOString(),
      trainingRowCount: rows.length,
      trainingRowsBySeason: bySeason,
      generator: "scripts/hist/final/10-freeze.mjs",
      immutable: true,
    }

    fs.writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2))
    console.log(`\nmodelHash: ${modelHash}`)
    console.log(`frozenAt : ${artifact.frozenAt}`)
    console.log(`wrote    : ${ARTIFACT_PATH}`)

    // Record the freeze in the DB too (audit; the file remains the source of truth).
    await q(`CREATE TABLE IF NOT EXISTS bse_frozen_candidate (
      model_hash text PRIMARY KEY,
      candidate_id text NOT NULL,
      family text NOT NULL,
      model text NOT NULL,
      threshold double precision NOT NULL,
      feature_version text NOT NULL,
      hyperparams jsonb NOT NULL,
      train_seasons integer[] NOT NULL,
      training_row_count integer NOT NULL,
      frozen_at timestamptz NOT NULL,
      artifact_path text NOT NULL
    )`)
    await q(
      `INSERT INTO bse_frozen_candidate
        (model_hash, candidate_id, family, model, threshold, feature_version, hyperparams, train_seasons, training_row_count, frozen_at, artifact_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (model_hash) DO NOTHING`,
      [
        modelHash, payload.candidateId, payload.family, payload.model, payload.threshold, payload.featureVersion,
        JSON.stringify(payload.hyperparams), FREEZE.trainSeasons, rows.length, artifact.frozenAt, "scripts/hist/final/frozen-candidate.json",
      ],
    )
    console.log(`recorded freeze in bse_frozen_candidate.`)
    console.log(`\nFREEZE COMPLETE. This artifact must never be modified by 2026 results.`)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error("FREEZE ERROR:", e.message)
  console.error(e.stack)
  process.exit(1)
})
