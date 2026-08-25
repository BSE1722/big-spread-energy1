// ---------------------------------------------------------------------------
// PHASE 5 — Scoring, uncertainty, diagnostics, classification, and report.
//
// Reads persisted OOS predictions from hist_phase5_predictions and scores them
// with the FROZEN scorer (../eval-protocol.mjs) only. Adds Wilson confidence
// intervals, ROI, per-season stability, edge calibration, market-dependence,
// and the DraftKings parity diagnostic. Emits phase5-results.json + a written
// report. Trains nothing; changes no thresholds. Classification rule is fixed
// in code BEFORE any result is read (see classify()).
// ---------------------------------------------------------------------------

import fs from "node:fs"
import path from "node:path"
import { makePool } from "../lib.mjs"
import { marginMetrics, atsAtThreshold, EDGE_THRESHOLDS, improvementOverMarket } from "../eval-protocol.mjs"

const OUT_DIR = path.join(process.cwd(), "scripts", "hist", "phase5")
const BREAKEVEN = 52.38
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000)
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)

// Inverse standard-normal CDF (Acklam's rational approximation) — used to build
// a family-wise (Bonferroni) z for the multiple-comparisons correction.
function invNorm(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p <= 1 - pl) {
    const q = p - 0.5
    const r = q * q
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  }
  const q = Math.sqrt(-2 * Math.log(1 - p))
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
}
// Two-sided family-wise z for nTested comparisons at overall alpha=0.05.
function bonferroniZ(nTested) {
  const alpha = 0.05 / Math.max(1, nTested)
  return invNorm(1 - alpha / 2)
}

// Wilson CI for a binomial proportion (wins over decided bets). z default 1.96 (95%).
function wilson(wins, decided, z = 1.96) {
  if (!decided) return { p: null, lo: null, hi: null }
  const p = wins / decided
  const z2 = z * z
  const denom = 1 + z2 / decided
  const center = (p + z2 / (2 * decided)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / decided + z2 / (4 * decided * decided))) / denom
  return { p: r1(p * 100), lo: r1((center - half) * 100), hi: r1((center + half) * 100) }
}

// ROI at flat -110 stakes: win +0.909, loss -1, push refunded (excluded).
function roi(a) {
  const decided = a.wins + a.losses
  if (!decided) return null
  return r1((100 * (a.wins * 0.909 - a.losses)) / decided)
}

function sampleFlag(decided) {
  if (decided < 30) return "NEGLIGIBLE_SAMPLE"
  if (decided < 100) return "SMALL_SAMPLE"
  if (decided < 300) return "MODERATE_SAMPLE"
  return "OK_SAMPLE"
}

// ---- Classification rule — FIXED before results were read -----------------
// This encodes the Phase-4/§6-§8 skepticism requirements (multiple-comparisons
// correction + edge calibration), which are *stricter* than a naive per-cell
// CI. It never lowers the bar toward a positive verdict.
//
// Adequate-sample cell = pooled over the 4 non-2020 test seasons with
// decided >= 200. Every such cell across all candidates and thresholds counts
// as one comparison in the family-wise (Bonferroni) correction.
//
// STRONG_EVIDENCE requires at least one FROZEN candidate/threshold cell where:
//   (1) MAE improvement over market > 0 (must actually be more accurate), AND
//   (2) family-wise-corrected CI lower bound of ATS win rate > 52.38%
//       (Bonferroni z over the number of adequate-sample cells tested), AND
//   (3) ATS win rate > 52.38% in >= 3 of the 4 non-2020 test seasons, AND
//   (4) edge calibration does not collapse: the cell's ATS win rate is not
//       LOWER than that of the next-lower threshold on the same candidate
//       (a genuine edge should not pay worse as predicted edge grows).
// PROMISING_BUT_UNPROVEN: some adequate-sample cell has pooled point ATS >
//   52.38%, but no cell clears all four STRONG gates.
// NO_RELIABLE_EDGE: otherwise.
function classify(candidateDiagnostics) {
  // Count adequate-sample cells → family-wise correction size.
  const cells = []
  for (const c of candidateDiagnostics)
    for (const t of c.thresholdsExcl2020) if (t.decided >= 200 && t.winPct != null) cells.push({ c, t })
  const nTested = cells.length
  const zFW = bonferroniZ(nTested)

  let promising = false
  const strongHits = []
  for (const { c, t } of cells) {
    if (t.winPct > BREAKEVEN) promising = true
    // Family-wise-corrected lower bound (recompute Wilson at the Bonferroni z).
    const fw = wilson(t.wins, t.decided, zFW)
    // Non-collapse: compare to the next-lower threshold on the same candidate.
    const lower = c.thresholdsExcl2020
      .filter((x) => x.threshold < t.threshold && x.winPct != null)
      .sort((a, b) => b.threshold - a.threshold)[0]
    const nonCollapse = !lower || t.winPct >= lower.winPct
    const strong =
      c.maeImprovementExcl2020 > 0 &&
      fw.lo != null &&
      fw.lo > BREAKEVEN &&
      t.seasonsAboveBreakeven >= 3 &&
      nonCollapse
    if (strong) strongHits.push({ candidate: c.key, threshold: t.threshold, winPct: t.winPct, familywiseCiLo: fw.lo })
  }

  return {
    label: strongHits.length ? "STRONG_EVIDENCE" : promising ? "PROMISING_BUT_UNPROVEN" : "NO_RELIABLE_EDGE",
    familywise: { adequateSampleCellsTested: nTested, bonferroniZ: r3(zFW), alphaPerCell: r3(0.05 / Math.max(1, nTested)) },
    ...(strongHits.length ? { by: strongHits } : {}),
  }
}

// Score a set of prediction records at all thresholds, with CI/ROI.
function scoreThresholds(recs) {
  return EDGE_THRESHOLDS.map((t) => {
    const a = atsAtThreshold(recs, t)
    const decided = a.wins + a.losses
    const ci = wilson(a.wins, decided)
    return { ...a, decided, ci, roi: roi(a), sample: sampleFlag(decided) }
  })
}

async function main() {
  const pool = makePool()
  const q = async (s, p = []) => (await pool.query(s, p)).rows
  try {
    const all = await q(`select * from hist_phase5_predictions`)
    if (!all.length) throw new Error("No predictions found. Run 06-tournament.mjs first.")

    // records use the scorer's field names.
    const toRec = (r) => ({
      predicted_home_margin: Number(r.predicted_home_margin),
      market_implied_home_margin: Number(r.market_implied_home_margin),
      actual_margin: Number(r.actual_margin),
      season: r.season,
      provider: r.market_provider,
      is2020: r.is_anomalous_season,
      edge: Number(r.predicted_edge),
      realized: Number(r.actual_margin) - Number(r.market_implied_home_margin),
    })

    const candidates = [...new Set(all.map((r) => `${r.family}::${r.model}`))].sort()
    const seasonsAll = [...new Set(all.map((r) => r.season))].sort()
    const seasonsExcl = seasonsAll.filter((s) => s !== 2020)

    const results = { generatedAt: new Date().toISOString(), breakeven: BREAKEVEN, candidates: {}, leaderboard: [] }
    const candidateDiagnostics = []

    for (const key of candidates) {
      const [family, model] = key.split("::")
      const recs = all.filter((r) => `${r.family}::${r.model}` === key).map(toRec)
      const recsExcl = recs.filter((r) => !r.is2020)

      const mmAll = marginMetrics(recs)
      const impAll = improvementOverMarket(recs)
      const impExcl = improvementOverMarket(recsExcl)

      // Per-fold / per-season margin + threshold sweeps.
      const bySeason = {}
      for (const s of seasonsAll) {
        const rs = recs.filter((r) => r.season === s)
        bySeason[s] = { n: rs.length, margin: marginMetrics(rs), imp: improvementOverMarket(rs), thresholds: scoreThresholds(rs) }
      }

      const thrAll = scoreThresholds(recs)
      const thrExcl = scoreThresholds(recsExcl)

      // Seasonal stability per threshold (how many non-2020 seasons beat breakeven).
      const thrExclEnriched = thrExcl.map((t) => {
        let seasonsAbove = 0
        const perSeason = seasonsExcl.map((s) => {
          const st = bySeason[s].thresholds.find((x) => x.threshold === t.threshold)
          const above = st && st.winPct != null && st.winPct > BREAKEVEN
          if (above) seasonsAbove++
          return { season: s, decided: st?.decided ?? 0, winPct: st?.winPct ?? null, roi: st?.roi ?? null }
        })
        return {
          threshold: t.threshold,
          qualifying: t.qualifying,
          wins: t.wins,
          losses: t.losses,
          pushes: t.pushes,
          decided: t.decided,
          winPct: t.winPct,
          ciLo: t.ci.lo,
          ciHi: t.ci.hi,
          roi: t.roi,
          sample: t.sample,
          seasonsAboveBreakeven: seasonsAbove,
          perSeason,
        }
      })

      results.candidates[key] = {
        family,
        model,
        n: recs.length,
        margin: { all: mmAll },
        marketComparison: { all: impAll, excl2020: impExcl },
        thresholdsAll: thrAll.map((t) => ({ threshold: t.threshold, qualifying: t.qualifying, wins: t.wins, losses: t.losses, pushes: t.pushes, decided: t.decided, winPct: t.winPct, ciLo: t.ci.lo, ciHi: t.ci.hi, roi: t.roi, sample: t.sample })),
        thresholdsExcl2020: thrExclEnriched,
        bySeason: Object.fromEntries(
          Object.entries(bySeason).map(([s, v]) => [
            s,
            { n: v.n, mae: r3(v.margin.mae), marketMae: r3(v.imp.marketMae), maeImprovement: r3(v.imp.maeImprovement) },
          ]),
        ),
      }

      candidateDiagnostics.push({
        key,
        family,
        model,
        maeImprovementAll: impAll.maeImprovement,
        maeImprovementExcl2020: impExcl.maeImprovement,
        thresholdsExcl2020: thrExclEnriched,
      })

      results.leaderboard.push({
        candidate: key,
        family,
        model,
        n: recs.length,
        maeAll: r3(mmAll.mae),
        marketMaeAll: r3(impAll.marketMae),
        maeImprovementAll: r3(impAll.maeImprovement),
        maeImprovementExcl2020: r3(impExcl.maeImprovement),
        biasAll: r3(mmAll.bias),
      })
    }

    results.leaderboard.sort((a, b) => (b.maeImprovementExcl2020 ?? -9) - (a.maeImprovementExcl2020 ?? -9))

    // ---- Edge calibration (per candidate): does bigger predicted edge pay? --
    const calibBuckets = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 5],
      [5, 7],
      [7, Infinity],
    ]
    results.edgeCalibration = {}
    for (const key of candidates) {
      const recs = all.filter((r) => `${r.family}::${r.model}` === key).map(toRec).filter((r) => !r.is2020)
      results.edgeCalibration[key] = calibBuckets.map(([lo, hi]) => {
        const b = recs.filter((r) => Math.abs(r.edge) >= lo && Math.abs(r.edge) < hi)
        let wins = 0
        let losses = 0
        let pushes = 0
        let capturedSum = 0
        for (const r of b) {
          if (r.realized === 0) pushes++
          else if (Math.sign(r.edge) === Math.sign(r.realized)) wins++
          else losses++
          capturedSum += Math.sign(r.edge) * r.realized // realized market error captured in bet direction
        }
        const decided = wins + losses
        return {
          bucket: hi === Infinity ? `${lo}+` : `${lo}-${hi}`,
          n: b.length,
          decided,
          winPct: decided ? r1((100 * wins) / decided) : null,
          ci: wilson(wins, decided),
          meanCapturedMarketError: b.length ? r3(capturedSum / b.length) : null,
          sample: sampleFlag(decided),
        }
      })
    }

    // ---- Market-dependence (Family A): is the "independent" line really independent? --
    results.marketDependence = {}
    for (const key of candidates.filter((k) => k.startsWith("A_"))) {
      const recs = all.filter((r) => `${r.family}::${r.model}` === key).map(toRec)
      // Pearson corr(predicted_home_margin, market_implied_home_margin) + disagreement.
      const xs = recs.map((r) => r.predicted_home_margin)
      const ys = recs.map((r) => r.market_implied_home_margin)
      const n = xs.length
      const mx = xs.reduce((a, b) => a + b, 0) / n
      const my = ys.reduce((a, b) => a + b, 0) / n
      let sxy = 0
      let sxx = 0
      let syy = 0
      const absDis = []
      for (let i = 0; i < n; i++) {
        sxy += (xs[i] - mx) * (ys[i] - my)
        sxx += (xs[i] - mx) ** 2
        syy += (ys[i] - my) ** 2
        absDis.push(Math.abs(xs[i] - ys[i]))
      }
      absDis.sort((a, b) => a - b)
      results.marketDependence[key] = {
        corrWithMarket: r3(sxy / Math.sqrt(sxx * syy)),
        meanAbsDisagreement: r3(absDis.reduce((a, b) => a + b, 0) / n),
        medianAbsDisagreement: r3(absDis[Math.floor(n / 2)]),
        p90AbsDisagreement: r3(absDis[Math.floor(n * 0.9)]),
      }
    }

    // ---- DraftKings parity diagnostic (diagnostic only; not for selection) --
    results.draftkingsDiagnostic = {}
    for (const key of candidates) {
      const recs = all.filter((r) => `${r.family}::${r.model}` === key && r.market_provider === "DraftKings" && !r.is_anomalous_season).map(toRec)
      const imp = improvementOverMarket(recs)
      results.draftkingsDiagnostic[key] = {
        n: recs.length,
        note: "DraftKings-only rows, excl 2020. Diagnostic only — NOT used to select any model or threshold.",
        mae: r3(marginMetrics(recs).mae),
        marketMae: r3(imp.marketMae),
        maeImprovement: r3(imp.maeImprovement),
        thresholds: scoreThresholds(recs).map((t) => ({ threshold: t.threshold, decided: t.decided, winPct: t.winPct, ciLo: t.ci.lo, ciHi: t.ci.hi, sample: t.sample })),
      }
    }

    // ---- Stability summary per candidate ------------------------------------
    results.stability = {}
    for (const key of candidates) {
      const c = results.candidates[key]
      const seasonImps = seasonsExcl.map((s) => ({ season: s, imp: c.bySeason[s].maeImprovement }))
      const imps = seasonImps.map((x) => x.imp).filter((x) => x != null)
      const meanImp = imps.reduce((a, b) => a + b, 0) / (imps.length || 1)
      const varImp = imps.reduce((a, b) => a + (b - meanImp) ** 2, 0) / (imps.length || 1)
      results.stability[key] = {
        seasonMaeImprovementsExcl2020: seasonImps.map((x) => ({ season: x.season, maeImprovement: r3(x.imp) })),
        seasonsWithPositiveMaeImprovement: imps.filter((x) => x > 0).length,
        worstSeason: seasonImps.reduce((a, b) => (b.imp < a.imp ? b : a)),
        bestSeason: seasonImps.reduce((a, b) => (b.imp > a.imp ? b : a)),
        maeImprovementStdAcrossSeasons: r3(Math.sqrt(varImp)),
        season2020Stress: { maeImprovement: r3(c.bySeason[2020]?.maeImprovement ?? null) },
        season2023: { maeImprovement: r3(c.bySeason[2023]?.maeImprovement ?? null) },
      }
    }

    // ---- Classification (rule fixed above) ----------------------------------
    results.classification = classify(candidateDiagnostics)

    fs.writeFileSync(path.join(OUT_DIR, "phase5-results.json"), JSON.stringify(results, null, 2))

    // ---- Console summary ----------------------------------------------------
    console.log(`\n=== PHASE 5 LEADERBOARD (sorted by MAE improvement vs market, excl 2020) ===`)
    console.log(`candidate                          n     MAE     mktMAE  dMAE(all) dMAE(x20) bias`)
    for (const l of results.leaderboard) {
      console.log(
        `${l.candidate.padEnd(34)} ${String(l.n).padStart(5)} ${String(l.maeAll).padStart(7)} ${String(l.marketMaeAll).padStart(7)} ${String(l.maeImprovementAll).padStart(9)} ${String(l.maeImprovementExcl2020).padStart(9)} ${String(l.biasAll).padStart(6)}`,
      )
    }

    console.log(`\n=== ATS THRESHOLD TABLE (pooled, excl 2020) ===`)
    for (const key of candidates) {
      console.log(`\n${key}:`)
      console.log(`  thr  qualifying  W-L-P       win%   Wilson95        ROI%    seasons>BE  sample`)
      for (const t of results.candidates[key].thresholdsExcl2020) {
        console.log(
          `  ${String(t.threshold).padStart(3)}  ${String(t.qualifying).padStart(10)}  ${`${t.wins}-${t.losses}-${t.pushes}`.padEnd(11)} ${String(t.winPct ?? "-").padStart(5)}  [${String(t.ciLo ?? "-").padStart(5)},${String(t.ciHi ?? "-").padStart(5)}]  ${String(t.roi ?? "-").padStart(6)}  ${String(t.seasonsAboveBreakeven).padStart(2)}/${seasonsExcl.length}       ${t.sample}`,
        )
      }
    }

    console.log(`\n=== MARKET DEPENDENCE (Family A) ===`)
    for (const [k, v] of Object.entries(results.marketDependence)) {
      console.log(`  ${k}: corr(fair, market)=${v.corrWithMarket}  meanAbsDisagreement=${v.meanAbsDisagreement}  p90=${v.p90AbsDisagreement}`)
    }

    console.log(`\n=== EDGE CALIBRATION (best family B candidate example) ===`)
    const exampleKey = candidates.find((k) => k.startsWith("B_")) || candidates[0]
    console.log(`  ${exampleKey}:`)
    console.log(`  bucket   n     decided  win%   Wilson95        meanCapturedMktErr  sample`)
    for (const b of results.edgeCalibration[exampleKey]) {
      console.log(
        `  ${b.bucket.padEnd(7)} ${String(b.n).padStart(5)} ${String(b.decided).padStart(7)}  ${String(b.winPct ?? "-").padStart(5)}  [${String(b.ci.lo ?? "-").padStart(5)},${String(b.ci.hi ?? "-").padStart(5)}]  ${String(b.meanCapturedMarketError ?? "-").padStart(16)}  ${b.sample}`,
      )
    }

    console.log(`\n=== DRAFTKINGS DIAGNOSTIC (diagnostic only) ===`)
    for (const [k, v] of Object.entries(results.draftkingsDiagnostic)) {
      console.log(`  ${k}: n=${v.n} MAE=${v.mae} dMAE=${v.maeImprovement}`)
    }

    console.log(`\n=== CLASSIFICATION: ${results.classification.label} ===`)
    console.log(`  family-wise correction: ${JSON.stringify(results.classification.familywise)}`)
    if (results.classification.by) console.log(`  cells clearing ALL strong gates: ${JSON.stringify(results.classification.by)}`)
    else console.log(`  cells clearing ALL strong gates: none`)

    console.log(`\nWrote ${path.join(OUT_DIR, "phase5-results.json")}`)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error("SCORE ERROR:", e.message)
  console.error(e.stack)
  process.exit(1)
})
