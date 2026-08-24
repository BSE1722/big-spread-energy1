// ---------------------------------------------------------------------------
// Phase 4 — Feature audit + walk-forward experiment design.
//
// READ-ONLY analysis. Does NOT train a model, select a model, or generate
// picks. Reads hist_training_rows, computes: (1) feature availability, (2) the
// market baseline with orientation assertions, (3) feature-family signal with
// temporal stability + collinearity, (4) walk-forward fold row counts. Emits a
// machine-readable JSON so Phase 5 can reproduce the exact experiment.
// ---------------------------------------------------------------------------

import fs from "node:fs"
import path from "node:path"
import { makePool } from "./lib.mjs"
import { pearson, errorMetrics, mean, std, r2, pct } from "./stats.mjs"

const OUT_DIR = path.join(process.cwd(), "scripts", "hist", "phase4")

// --- Derived differential features (home-minus-away unless noted) -----------
// Each is a pure function of pregame columns only. `net` efficiency subtracts
// defense (PPA/points ALLOWED, lower = better) from offense so higher = better.
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const diff = (a, b) => (num(a) != null && num(b) != null ? a - b : null)
const net = (off, def) => (num(off) != null && num(def) != null ? off - def : null)

const DERIVED = {
  // Market (the baseline to beat) — see orientation assertion below.
  market_implied_home_margin: (r) => (num(r.market_spread) != null ? -r.market_spread : null),
  market_open_implied_home_margin: (r) => (num(r.market_spread_open) != null ? -r.market_spread_open : null),

  elo_diff: (r) => diff(r.home_elo_pregame, r.away_elo_pregame),
  talent_diff: (r) => diff(r.home_talent, r.away_talent),

  prior_sp_diff: (r) => diff(r.home_prior_sp, r.away_prior_sp),
  prior_srs_diff: (r) => diff(r.home_prior_srs, r.away_prior_srs),
  prior_fpi_diff: (r) => diff(r.home_prior_fpi, r.away_prior_fpi),

  recruiting_points_diff: (r) => diff(r.home_recruiting_points, r.away_recruiting_points),
  returning_ppa_diff: (r) => diff(r.home_returning_ppa, r.away_returning_ppa),
  returning_percent_diff: (r) => diff(r.home_returning_percent, r.away_returning_percent),

  // Recent form (as-of same-season averages). Null for early-season teams.
  form_net_ppa_diff: (r) => diff(net(r.home_avg_off_ppa, r.home_avg_def_ppa), net(r.away_avg_off_ppa, r.away_avg_def_ppa)),
  form_net_success_diff: (r) => diff(net(r.home_avg_off_success, r.home_avg_def_success), net(r.away_avg_off_success, r.away_avg_def_success)),
  form_net_explo_diff: (r) => diff(net(r.home_avg_off_explosiveness, r.home_avg_def_explosiveness), net(r.away_avg_off_explosiveness, r.away_avg_def_explosiveness)),
  form_ppa_overall_diff: (r) => diff(net(r.home_avg_ppa_off_overall, r.home_avg_ppa_def_overall), net(r.away_avg_ppa_off_overall, r.away_avg_ppa_def_overall)),
  form_scoring_margin_diff: (r) => diff(r.home_avg_margin, r.away_avg_margin),
  form_points_for_diff: (r) => diff(r.home_avg_points_for, r.away_avg_points_for),
  form_points_against_diff: (r) => diff(r.home_avg_points_against, r.away_avg_points_against),

  rest_diff: (r) => diff(r.home_rest_days, r.away_rest_days),
  games_played_diff: (r) => diff(r.home_games_played_ytd, r.away_games_played_ytd),
}

// Which family each derived feature belongs to (for the family report).
const FAMILY = {
  market_implied_home_margin: "market",
  market_open_implied_home_margin: "market",
  elo_diff: "elo",
  talent_diff: "talent",
  prior_sp_diff: "prior-season ratings",
  prior_srs_diff: "prior-season ratings",
  prior_fpi_diff: "prior-season ratings",
  recruiting_points_diff: "recruiting",
  returning_ppa_diff: "returning production",
  returning_percent_diff: "returning production",
  form_net_ppa_diff: "advanced efficiency/PPA",
  form_net_success_diff: "advanced efficiency/PPA",
  form_net_explo_diff: "advanced efficiency/PPA",
  form_ppa_overall_diff: "advanced efficiency/PPA",
  form_scoring_margin_diff: "scoring",
  form_points_for_diff: "scoring",
  form_points_against_diff: "scoring",
  rest_diff: "rest/schedule",
  games_played_diff: "rest/schedule",
}

async function main() {
  const pool = makePool()
  const q = async (s, p = []) => (await pool.query(s, p)).rows
  fs.mkdirSync(OUT_DIR, { recursive: true })

  try {
    const rows = await q(`select * from hist_training_rows order by "startDate" nulls last, "gameId"`)
    const N = rows.length
    console.log(`\n=== PHASE 4 AUDIT — ${N} training rows ===`)

    // ---- 0. label distribution + season counts --------------------------
    const seasons = [...new Set(rows.map((r) => r.season))].sort()
    const bySeason = Object.fromEntries(seasons.map((s) => [s, rows.filter((r) => r.season === s)]))
    const actual = rows.map((r) => r.actual_margin)
    console.log(`Seasons: ${seasons.join(", ")}`)
    console.log(`actual_margin: mean=${r2(mean(actual))} std=${r2(std(actual))} (home-field baseline bias)`)

    // ---- 1. FEATURE INVENTORY (availability %) --------------------------
    // Raw column availability.
    const colNames = Object.keys(rows[0])
    const inventory = {}
    for (const c of colNames) {
      const nonNull = rows.filter((r) => r[c] !== null && r[c] !== undefined).length
      inventory[c] = { nonNull, availabilityPct: pct(nonNull, N) }
    }

    // Derived feature availability.
    const derivedValues = {}
    const derivedInventory = {}
    for (const [name, fn] of Object.entries(DERIVED)) {
      const vals = rows.map(fn)
      derivedValues[name] = vals
      const nonNull = vals.filter((v) => num(v) != null).length
      derivedInventory[name] = { family: FAMILY[name], nonNull, availabilityPct: pct(nonNull, N) }
    }

    // ---- 2. MARKET BASELINE + ORIENTATION ASSERTIONS --------------------
    const mihm = derivedValues.market_implied_home_margin
    const orient = pearson(mihm, actual)
    // Straight-up (directional) agreement over rows with a non-zero market line.
    let suPairs = 0
    let suAgree = 0
    for (let i = 0; i < N; i++) {
      const m = mihm[i]
      const a = actual[i]
      if (num(m) != null && num(a) != null && m !== 0 && a !== 0) {
        suPairs++
        if (Math.sign(m) === Math.sign(a)) suAgree++
      }
    }
    const suAcc = pct(suAgree, suPairs)

    console.log(`\n--- MARKET ORIENTATION ASSERTIONS ---`)
    console.log(`market_implied_home_margin = -market_spread`)
    console.log(`corr(market_implied_home_margin, actual_margin) = ${r2(orient.r)} over n=${orient.n}`)
    console.log(`market straight-up accuracy = ${suAcc}% over n=${suPairs}`)
    // Hard gates: a correctly-oriented market must positively predict margin.
    if (!(orient.r > 0.5)) throw new Error(`ORIENTATION FAIL: expected corr>0.5, got ${r2(orient.r)}`)
    if (!(suAcc > 60)) throw new Error(`ORIENTATION FAIL: expected SU acc>60%, got ${suAcc}%`)
    console.log(`ASSERTIONS PASSED — market_implied_home_margin is correctly oriented.`)

    const marketBaseline = { overall: errorMetrics(mihm, actual), suAccuracyPct: suAcc, suN: suPairs, orientationCorr: r2(orient.r), bySeason: {} }
    for (const s of seasons) {
      const rs = bySeason[s]
      const p = rs.map(DERIVED.market_implied_home_margin)
      const a = rs.map((r) => r.actual_margin)
      const em = errorMetrics(p, a)
      marketBaseline.bySeason[s] = { n: em.n, mae: r2(em.mae), rmse: r2(em.rmse), bias: r2(em.bias) }
    }
    const mb = marketBaseline.overall
    console.log(`\n--- MARKET BASELINE (to beat) ---`)
    console.log(`overall: n=${mb.n} MAE=${r2(mb.mae)} RMSE=${r2(mb.rmse)} bias=${r2(mb.bias)}`)
    for (const s of seasons) {
      const b = marketBaseline.bySeason[s]
      console.log(`  ${s}: n=${b.n} MAE=${b.mae} RMSE=${b.rmse} bias=${b.bias}`)
    }

    // ---- 3. FEATURE-FAMILY SIGNAL AUDIT ---------------------------------
    // Correlation with actual_margin: overall, per-season (stability), and
    // early (week<=4) vs late (week>=9). Also missingness + collinearity.
    const early = rows.map((r, i) => ({ i, w: r.week }))
    const idxEarly = early.filter((x) => num(x.w) != null && x.w <= 4).map((x) => x.i)
    const idxLate = early.filter((x) => num(x.w) != null && x.w >= 9).map((x) => x.i)
    const pick = (arr, idx) => idx.map((i) => arr[i])

    const signal = {}
    console.log(`\n--- FEATURE-FAMILY SIGNAL (corr with actual_margin) ---`)
    console.log(`feature                        avail%   corr    n     early   late   seasonCorrStd`)
    for (const name of Object.keys(DERIVED)) {
      const vals = derivedValues[name]
      const overall = pearson(vals, actual)
      const seasonCorrs = []
      for (const s of seasons) {
        const rs = bySeason[s]
        const sv = rs.map(DERIVED[name])
        const sa = rs.map((r) => r.actual_margin)
        const pr = pearson(sv, sa)
        if (pr.r != null) seasonCorrs.push(pr.r)
      }
      const earlyR = pearson(pick(vals, idxEarly), pick(actual, idxEarly))
      const lateR = pearson(pick(vals, idxLate), pick(actual, idxLate))
      const seasonStd = std(seasonCorrs)
      signal[name] = {
        family: FAMILY[name],
        availabilityPct: derivedInventory[name].availabilityPct,
        corrOverall: r2(overall.r),
        n: overall.n,
        corrEarly: r2(earlyR.r),
        corrLate: r2(lateR.r),
        seasonCorrMean: r2(mean(seasonCorrs)),
        seasonCorrStd: r2(seasonStd),
        seasonCorrs: seasonCorrs.map((x) => r2(x)),
      }
      console.log(
        `${name.padEnd(30)} ${String(derivedInventory[name].availabilityPct).padStart(5)}  ${String(r2(overall.r)).padStart(6)}  ${String(overall.n).padStart(5)}  ${String(r2(earlyR.r)).padStart(6)} ${String(r2(lateR.r)).padStart(6)}  ${String(r2(seasonStd))}`,
      )
    }

    // ---- 3b. COLLINEARITY among the strongest non-market predictors -----
    const collinPairs = [
      "market_implied_home_margin", "elo_diff", "prior_sp_diff", "prior_fpi_diff",
      "talent_diff", "form_net_ppa_diff", "form_ppa_overall_diff", "form_scoring_margin_diff",
      "recruiting_points_diff", "returning_ppa_diff",
    ]
    const collinearity = {}
    console.log(`\n--- COLLINEARITY (pairwise r among key features) ---`)
    for (const a of collinPairs) {
      collinearity[a] = {}
      const line = []
      for (const b of collinPairs) {
        const pr = pearson(derivedValues[a], derivedValues[b])
        collinearity[a][b] = r2(pr.r)
        line.push(String(r2(pr.r)).padStart(6))
      }
      console.log(`${a.padEnd(30)} ${line.join(" ")}`)
    }
    console.log(`(columns in same order as rows)`)

    // ---- 4. WALK-FORWARD FOLD ROW COUNTS --------------------------------
    const folds = [
      { name: "fold1", trainStart: 2015, trainEnd: 2018, test: 2019 },
      { name: "fold2", trainStart: 2015, trainEnd: 2019, test: 2020 },
      { name: "fold3", trainStart: 2015, trainEnd: 2020, test: 2021 },
      { name: "fold4", trainStart: 2015, trainEnd: 2021, test: 2022 },
      { name: "fold5", trainStart: 2015, trainEnd: 2022, test: 2023 },
    ]
    console.log(`\n--- WALK-FORWARD FOLDS (expanding window) ---`)
    const foldCounts = folds.map((f) => {
      const train = rows.filter((r) => r.season >= f.trainStart && r.season <= f.trainEnd)
      const test = rows.filter((r) => r.season === f.test)
      const trainAnom = train.filter((r) => r.is_anomalous_season).length
      const rec = {
        ...f,
        trainRows: train.length,
        testRows: test.length,
        trainRowsExcl2020: train.length - trainAnom,
        testIsAnomalous: test.length > 0 && test.every((r) => r.is_anomalous_season),
      }
      console.log(`  ${f.name}: train ${f.trainStart}-${f.trainEnd} = ${rec.trainRows} rows (excl2020 ${rec.trainRowsExcl2020}) -> test ${f.test} = ${rec.testRows} rows${rec.testIsAnomalous ? "  [ANOMALOUS TEST SEASON]" : ""}`)
      return rec
    })

    // ---- 5. MARKET COVERAGE (train/serve parity concern) ----------------
    const provCounts = {}
    for (const r of rows) {
      const p = r.market_provider || "none"
      provCounts[p] = (provCounts[p] || 0) + 1
    }
    console.log(`\n--- MARKET PROVIDER COVERAGE (train/serve parity) ---`)
    for (const [p, c] of Object.entries(provCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${p.padEnd(14)} ${c}  (${pct(c, N)}%)`)
    }

    // ---- write machine-readable results ---------------------------------
    const results = {
      generatedAt: new Date().toISOString(),
      trainingRows: N,
      seasons,
      seasonCounts: Object.fromEntries(seasons.map((s) => [s, bySeason[s].length])),
      label: { name: "actual_margin", def: "home_points - away_points", mean: r2(mean(actual)), std: r2(std(actual)) },
      rawInventory: inventory,
      derivedInventory,
      marketBaseline,
      signal,
      collinearity,
      collinearityOrder: collinPairs,
      walkForwardFolds: foldCounts,
      marketProviderCoverage: Object.fromEntries(Object.entries(provCounts).map(([p, c]) => [p, { n: c, pct: pct(c, N) }])),
    }
    fs.writeFileSync(path.join(OUT_DIR, "audit-results.json"), JSON.stringify(results, null, 2))
    console.log(`\nWrote ${path.join(OUT_DIR, "audit-results.json")}`)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error("AUDIT ERROR:", e.message)
  console.error(e.stack)
  process.exit(1)
})
