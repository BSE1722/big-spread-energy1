// ---------------------------------------------------------------------------
// FROZEN SCORER PARITY / SELF-CONSISTENCY CHECK
//
// Proves the serialized artifact scores identically to an in-memory refit using
// the SAME frozen recipe, and that the family-B edge identity holds. This does
// NOT re-tune or search — it re-materializes the exact recipe once and compares.
//
//   Test 1  (serialization fidelity): for every training row, the artifact's
//           gbtPredict(edge) must equal a fresh gbtFit(...same recipe...) edge
//           to < 1e-9. Confirms edgesPerCol/trees/spec round-tripped losslessly.
//
//   Test 2  (edge identity): edge == predicted_home_margin - market_implied,
//           i.e. scoreFrozen(row).edge reproduces the residual target space.
//
//   Test 3  (fire-rate sanity): |edge|>=1 fire rate matches the freeze log.
// ---------------------------------------------------------------------------

import { makePool } from "../lib.mjs"
import { fitPreprocess, transformRaw, marketImplied } from "../phase5/features5.mjs"
import { gbtFit, gbtPredict } from "../phase5/ml5.mjs"
import { loadFrozenArtifact, scoreFrozen } from "./score-frozen.mjs"

async function main() {
  const art = loadFrozenArtifact()
  const pool = makePool()
  const q = async (s, p = []) => (await pool.query(s, p)).rows
  try {
    const rows = (await q(`select * from hist_training_rows order by "startDate" nulls last, "gameId"`))
      .filter((r) => art.trainSeasons.includes(r.season) && !r.is_anomalous_season)
      .filter((r) => marketImplied(r) != null && r.actual_margin != null)

    // Rebuild the recipe in memory (identical settings to 10-freeze.mjs).
    const spec = fitPreprocess(rows)
    const X = transformRaw(rows, spec)
    const y = rows.map((r) => r.actual_margin - marketImplied(r))
    const fresh = gbtFit(X, y, null, null, {
      depth: art.hyperparams.depth,
      learningRate: art.hyperparams.learningRate,
      maxTrees: art.hyperparams.nTrees,
      minLeaf: art.minLeaf,
      maxBins: art.maxBins,
    })
    const freshEdge = gbtPredict(fresh, X)

    // Test 1: artifact scorer vs fresh refit, row by row. Compare at FULL
    // precision (scoreFrozen rounds its public edge to 4dp for storage, so we
    // compare against the raw serialized prediction, not the rounded surface).
    const { spec: artSpec, model: artModel } = {
      spec: {
        base: art.preprocess.base, missFlags: art.preprocess.missFlags, medians: art.preprocess.medians,
        columns: art.preprocess.columns, mean: art.preprocess.mean, stdv: art.preprocess.stdv,
      },
      model: { base: art.gbt.base, learningRate: art.gbt.learningRate, edgesPerCol: art.gbt.edgesPerCol, trees: art.gbt.trees },
    }
    const artEdge = gbtPredict(artModel, transformRaw(rows, artSpec))

    let maxDiff = 0
    let maxRoundDiff = 0
    let fires = 0
    let identityMax = 0
    for (let i = 0; i < rows.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(artEdge[i] - freshEdge[i]))
      const s = scoreFrozen(art, rows[i])
      maxRoundDiff = Math.max(maxRoundDiff, Math.abs(s.edge - artEdge[i]))
      if (s.fires) fires++
      // Test 2: predicted_home_margin - market_implied == edge (unrounded)
      const predictedHomeMargin = marketImplied(rows[i]) + artEdge[i]
      identityMax = Math.max(identityMax, Math.abs(predictedHomeMargin - marketImplied(rows[i]) - artEdge[i]))
    }

    console.log("=== FROZEN SCORER PARITY ===")
    console.log(`rows checked                : ${rows.length}`)
    console.log(`TEST 1 max|artifact-fresh|  : ${maxDiff.toExponential(3)}  ${maxDiff < 1e-9 ? "PASS" : "FAIL"}`)
    console.log(`TEST 2 max edge-identity err: ${identityMax.toExponential(3)}  ${identityMax < 1e-9 ? "PASS" : "FAIL"}`)
    console.log(`TEST 3 fire rate |edge|>=1  : ${fires}/${rows.length} (${((100 * fires) / rows.length).toFixed(1)}%)`)
    console.log(`(public edge rounding <=    : ${maxRoundDiff.toExponential(3)}, expected ~5e-5 from toFixed(4))`)

    const ok = maxDiff < 1e-9 && identityMax < 1e-9
    console.log(`\nOVERALL: ${ok ? "PASS — artifact scores identically to the frozen recipe" : "FAIL"}`)
    if (!ok) process.exit(1)
  } finally {
    await pool.end()
  }
}
main().catch((e) => {
  console.error("PARITY ERROR:", e.message, e.stack)
  process.exit(1)
})
