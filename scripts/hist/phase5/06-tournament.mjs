// ---------------------------------------------------------------------------
// PHASE 5 — Locked walk-forward model tournament (TRAIN + PREDICT + PERSIST).
//
// Executes the FROZEN Phase-4 protocol exactly. Trains the 4 predeclared
// candidates across the two families (A independent, B market-residual) over
// the 5 frozen expanding-window folds, and persists EVERY out-of-sample
// prediction to hist_phase5_predictions for auditable scoring in 07-score.mjs.
//
// Guardrails baked in:
//   * Freeze checksum printed + protocol invariants asserted before training.
//   * All preprocessing + hyperparameter tuning fit on the training fold ONLY,
//     via an internal temporal validation split (never the test season).
//   * 2020 excluded from training-fold fitting (protocol recommended default);
//     fold2 (test=2020) still predicted, but only as a labelled stress test.
//   * Frozen candidate set + small predetermined grids. No model shopping.
//   * DOES NOT deploy, wire to the board, or generate 2026 picks.
// ---------------------------------------------------------------------------

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { makePool } from "../lib.mjs"
import { fitPreprocess, transformRaw, transformStd, marketImplied } from "./features5.mjs"
import { ridgeFit, elasticNetFit, linearPredict, gbtFit, gbtPredict } from "./ml5.mjs"

const HIST = path.join(process.cwd(), "scripts", "hist")
const OUT_DIR = path.join(HIST, "phase5")
const PROTOCOL_PATH = path.join(HIST, "phase4", "evaluation-protocol.json")
const SCORER_PATH = path.join(HIST, "eval-protocol.mjs")

// Checksums captured at freeze time (printed in this run for the audit trail).
const EXPECTED = {
  protocol: "d7eef8d0f2af81ef9043803bd47aa23f45fa23064866ea378252815131a85f8a",
  scorer: "6ef33c33e79f61146a87ffba857c3ffc7800be7f1f867607322239c591ab9a5c",
}

const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")

// --- FROZEN grids (predetermined; tuned on internal validation only) -------
const GRID = {
  ridge: { lambda: [1, 10, 30, 100, 300] },
  elasticnet: { lambda: [0.5, 1, 3], l1ratio: [0.2, 0.5, 0.8] },
  gbt: { depth: [2, 3], learningRate: [0.05, 0.1], maxTrees: 300, minLeaf: 30, maxBins: 48, patience: 20 },
}

const mae = (pred, y) => {
  let s = 0
  for (let i = 0; i < y.length; i++) s += Math.abs(pred[i] - y[i])
  return s / y.length
}

function verifyFreeze(protocol) {
  console.log("\n=== 1. FREEZE VERIFICATION ===")
  const pHash = sha(PROTOCOL_PATH)
  const sHash = sha(SCORER_PATH)
  console.log(`protocol sha256 : ${pHash}`)
  console.log(`scorer   sha256 : ${sHash}`)
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`FREEZE ASSERTION FAILED: ${msg}`)
    console.log(`  ok  ${msg}`)
  }
  assert(pHash === EXPECTED.protocol, "evaluation-protocol.json checksum matches freeze")
  assert(sHash === EXPECTED.scorer, "eval-protocol.mjs (scorer) checksum matches freeze")
  assert(protocol.protocolVersion === "phase4-eval-v1", "protocolVersion == phase4-eval-v1")
  assert(protocol.walkForwardFolds.length === 5, "5 walk-forward folds")
  assert(protocol.label.name === "actual_margin", "label == actual_margin")
  assert(protocol.market.impliedHomeMargin.includes("-market_spread"), "market_implied_home_margin = -market_spread")
  const thr = protocol.lockedMetrics.betSelection.edgeThresholds
  assert(JSON.stringify(thr) === JSON.stringify([1, 2, 3, 4, 5, 7]), "edge thresholds [1,2,3,4,5,7]")
  assert(protocol.lockedMetrics.betSelection.breakevenAt110Pct === 52.38, "breakeven 52.38%")
  assert(
    protocol.lockedMetrics.betSelection.atsCoverRule.includes("actual_margin > market_implied_home_margin"),
    "ATS cover rule: home covers iff actual_margin > market_implied_home_margin",
  )
  assert(
    protocol.walkForwardRules.some((r) => r.includes("fit on the training fold ONLY")),
    "preprocessing fit on training fold only",
  )
  return { pHash, sHash }
}

// Tune + fit a linear model (ridge or enet) for a target on a train window.
function fitLinearTuned(kind, spec, fitRows, valRows, targetFn) {
  const Xfit = transformStd(fitRows, spec)
  const yfit = fitRows.map(targetFn)
  const Xval = transformStd(valRows, spec)
  const yval = valRows.map(targetFn)
  let best = null
  if (kind === "ridge") {
    for (const lambda of GRID.ridge.lambda) {
      const m = ridgeFit(Xfit, yfit, lambda)
      const v = mae(linearPredict(m, Xval), yval)
      if (!best || v < best.v) best = { v, hp: { lambda } }
    }
  } else {
    for (const lambda of GRID.elasticnet.lambda)
      for (const l1ratio of GRID.elasticnet.l1ratio) {
        const m = elasticNetFit(Xfit, yfit, lambda, l1ratio)
        const v = mae(linearPredict(m, Xval), yval)
        if (!best || v < best.v) best = { v, hp: { lambda, l1ratio } }
      }
  }
  return best.hp
}

function refitLinear(kind, spec, trainRows, hp, targetFn) {
  const X = transformStd(trainRows, spec)
  const y = trainRows.map(targetFn)
  return kind === "ridge" ? ridgeFit(X, y, hp.lambda) : elasticNetFit(X, y, hp.lambda, hp.l1ratio)
}

function fitGbtTuned(spec, fitRows, valRows, targetFn) {
  const Xfit = transformRaw(fitRows, spec)
  const yfit = fitRows.map(targetFn)
  const Xval = transformRaw(valRows, spec)
  const yval = valRows.map(targetFn)
  let best = null
  for (const depth of GRID.gbt.depth)
    for (const learningRate of GRID.gbt.learningRate) {
      const m = gbtFit(Xfit, yfit, Xval, yval, {
        depth,
        learningRate,
        maxTrees: GRID.gbt.maxTrees,
        minLeaf: GRID.gbt.minLeaf,
        maxBins: GRID.gbt.maxBins,
        patience: GRID.gbt.patience,
      })
      if (!best || m.bestValMae < best.v) best = { v: m.bestValMae, hp: { depth, learningRate, nTrees: m.nTrees } }
    }
  return best.hp
}

function refitGbt(spec, trainRows, hp, targetFn) {
  const X = transformRaw(trainRows, spec)
  const y = trainRows.map(targetFn)
  // Refit on full train with chosen depth/lr and the val-selected tree count fixed.
  return gbtFit(X, y, null, null, {
    depth: hp.depth,
    learningRate: hp.learningRate,
    maxTrees: hp.nTrees,
    minLeaf: GRID.gbt.minLeaf,
    maxBins: GRID.gbt.maxBins,
  })
}

async function main() {
  const protocol = JSON.parse(fs.readFileSync(PROTOCOL_PATH, "utf8"))
  const freeze = verifyFreeze(protocol)

  const pool = makePool()
  const q = async (s, p = []) => (await pool.query(s, p)).rows
  try {
    // Persist target table (idempotent). Predictions are re-derivable any time.
    await q(`CREATE TABLE IF NOT EXISTS hist_phase5_predictions (
      model text NOT NULL,
      family text NOT NULL,
      fold text NOT NULL,
      "gameId" bigint NOT NULL,
      season integer NOT NULL,
      week integer,
      "homeTeam" text,
      "awayTeam" text,
      market_provider text,
      is_anomalous_season boolean,
      actual_margin double precision,
      market_spread double precision,
      market_implied_home_margin double precision,
      predicted_home_margin double precision,
      predicted_edge double precision,
      hyperparams jsonb,
      PRIMARY KEY (model, family, "gameId")
    )`)
    await q(`TRUNCATE hist_phase5_predictions`)

    const rows = await q(`select * from hist_training_rows order by "startDate" nulls last, "gameId"`)
    console.log(`\nLoaded ${rows.length} training rows.`)

    const folds = protocol.walkForwardFolds.map((f) => ({ name: f.name, trainStart: f.trainStart, trainEnd: f.trainEnd, test: f.test }))

    // Family target functions.
    const targetA = (r) => r.actual_margin
    const targetB = (r) => {
      const m = marketImplied(r)
      return m == null || r.actual_margin == null ? null : r.actual_margin - m
    }

    const families = [
      { key: "A", label: "A_independent", target: targetA, needsMarket: false },
      { key: "B", label: "B_residual", target: targetB, needsMarket: true },
    ]
    const models = ["ridge", "elasticnet", "gbt"]

    const summary = []
    let persisted = 0

    for (const fold of folds) {
      // Train window rows, EXCLUDING 2020 from fitting (recommended default).
      const trainAll = rows.filter((r) => r.season >= fold.trainStart && r.season <= fold.trainEnd && !r.is_anomalous_season)
      const testAll = rows.filter((r) => r.season === fold.test)
      // Internal temporal validation split: last season in the (excl-2020) train window.
      const trainSeasons = [...new Set(trainAll.map((r) => r.season))].sort((a, b) => a - b)
      const valSeason = trainSeasons[trainSeasons.length - 1]
      const fitRows0 = trainAll.filter((r) => r.season < valSeason)
      const valRows0 = trainAll.filter((r) => r.season === valSeason)

      console.log(
        `\n=== ${fold.name}: train ${fold.trainStart}-${fold.trainEnd} (excl2020 -> ${trainAll.length} rows; internal val=${valSeason}) -> test ${fold.test} (${testAll.length} rows)${testAll.every((r) => r.is_anomalous_season) && testAll.length ? " [ANOMALOUS STRESS TEST]" : ""} ===`,
      )

      for (const fam of families) {
        // Preprocessing spec fit on TRAIN ONLY (market never enters features).
        const spec = fitPreprocess(trainAll)
        // For family B, restrict to rows with a market line (target defined).
        const famFilter = (r) => (fam.needsMarket ? marketImplied(r) != null : true)
        const trainRows = trainAll.filter(famFilter)
        const fitRows = fitRows0.filter(famFilter)
        const valRows = valRows0.filter(famFilter)
        const testRows = testAll.filter((r) => marketImplied(r) != null) // scoring always needs market

        for (const model of models) {
          let hp
          let predFn
          if (model === "gbt") {
            hp = fitGbtTuned(spec, fitRows, valRows, fam.target)
            const m = refitGbt(spec, trainRows, hp, fam.target)
            predFn = (rs) => gbtPredict(m, transformRaw(rs, spec))
          } else {
            hp = fitLinearTuned(model, spec, fitRows, valRows, fam.target)
            const m = refitLinear(model, spec, trainRows, hp, fam.target)
            predFn = (rs) => linearPredict(m, transformStd(rs, spec))
          }

          const rawPreds = predFn(testRows)
          const records = testRows.map((r, i) => {
            const mim = marketImplied(r)
            // Family A predicts margin directly; Family B predicts the residual,
            // reconstructed as market + residual.
            const predictedMargin = fam.key === "A" ? rawPreds[i] : mim + rawPreds[i]
            return { r, predictedMargin, mim, edge: predictedMargin - mim }
          })

          // Persist every OOS prediction.
          const modelName = model === "ridge" && fam.key === "B" ? "market_anchored_ridge" : model
          const values = []
          const params = []
          let k = 1
          for (const rec of records) {
            const r = rec.r
            values.push(
              `($${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++},$${k++})`,
            )
            params.push(
              modelName,
              fam.label,
              fold.name,
              r.gameId,
              r.season,
              r.week,
              r.homeTeam,
              r.awayTeam,
              r.market_provider,
              r.is_anomalous_season,
              r.actual_margin,
              r.market_spread,
              rec.mim,
              rec.predictedMargin,
              rec.edge,
              JSON.stringify(hp),
            )
          }
          // chunked insert
          const CH = 100
          for (let i = 0; i < values.length; i += CH) {
            const vs = values.slice(i, i + CH)
            const base = i * 16
            const reindexed = vs
              .map((_, rr) => `(${Array.from({ length: 16 }, (__, c) => `$${rr * 16 + c + 1}`).join(",")})`)
              .join(",")
            const ps = params.slice(base, base + vs.length * 16)
            await q(
              `insert into hist_phase5_predictions
               (model,family,fold,"gameId",season,week,"homeTeam","awayTeam",market_provider,is_anomalous_season,actual_margin,market_spread,market_implied_home_margin,predicted_home_margin,predicted_edge,hyperparams)
               values ${reindexed}
               on conflict (model,family,"gameId") do update set
                 predicted_home_margin=excluded.predicted_home_margin,
                 predicted_edge=excluded.predicted_edge,
                 hyperparams=excluded.hyperparams,
                 fold=excluded.fold`,
              ps,
            )
          }
          persisted += records.length

          const testMae = mae(records.map((x) => x.predictedMargin), records.map((x) => x.r.actual_margin))
          const mktMae = mae(records.map((x) => x.mim), records.map((x) => x.r.actual_margin))
          summary.push({ fold: fold.name, family: fam.label, model: modelName, hp, n: records.length, testMae, mktMae, improvement: mktMae - testMae })
          console.log(
            `  ${fam.label.padEnd(14)} ${modelName.padEnd(22)} hp=${JSON.stringify(hp).padEnd(40)} n=${records.length} MAE=${testMae.toFixed(3)} vsMkt=${(mktMae - testMae >= 0 ? "+" : "") + (mktMae - testMae).toFixed(3)}`,
          )
        }
      }
    }

    fs.writeFileSync(
      path.join(OUT_DIR, "tournament-run.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), freeze, grid: GRID, foldSummary: summary, persisted }, null, 2),
    )
    console.log(`\nPersisted ${persisted} OOS predictions to hist_phase5_predictions.`)
    console.log(`Wrote ${path.join(OUT_DIR, "tournament-run.json")}`)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error("TOURNAMENT ERROR:", e.message)
  console.error(e.stack)
  process.exit(1)
})
