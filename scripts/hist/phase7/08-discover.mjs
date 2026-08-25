// ---------------------------------------------------------------------------
// PHASE 7 — Market-failure & selectivity discovery (ANALYSIS ONLY).
//
// Reads ONLY frozen, leakage-safe inputs:
//   * hist_phase5_predictions  (frozen Phase 5 walk-forward OOS predictions)
//   * hist_training_rows       (leakage-safe as-of pregame features + label)
//   * hist_raw_games           (home/away conference, for concentration tests)
//
// Trains nothing. Deploys nothing. Generates no picks. Does not modify any
// Phase 1-6 artifact. Evaluates the PRE-REGISTERED regimes in
// regimes-config.json out-of-sample, with Bonferroni + BH-FDR correction,
// team/conference concentration tests, and threshold-neighborhood robustness.
// ---------------------------------------------------------------------------

import fs from "node:fs"
import path from "node:path"
import { makePool } from "../lib.mjs"

const HIST = path.join(process.cwd(), "scripts", "hist")
const DIR = path.join(HIST, "phase7")
const CONFIG = JSON.parse(fs.readFileSync(path.join(DIR, "regimes-config.json"), "utf8"))

const ELO_DIV = CONFIG.aprioriConstants.eloDivisorEquivalent // 25
const HFA = CONFIG.aprioriConstants.homeFieldAdvantagePoints // 2.5
const BREAKEVEN = CONFIG.breakeven.atsWinPctAt110 // 52.38
const MIN_DECIDED = CONFIG.walkForward.minDecidedForConsideration // 100

// ---- small stats helpers (self-contained) ---------------------------------
const finite = (x) => typeof x === "number" && Number.isFinite(x)
function erf(x) {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}
const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2))
// Two-sided binomial test vs p0=0.5 via normal approximation w/ continuity correction.
function binomTwoSidedP(wins, n, p0 = 0.5) {
  if (n === 0) return 1
  const mean = n * p0
  const sd = Math.sqrt(n * p0 * (1 - p0))
  if (sd === 0) return 1
  const z = (Math.abs(wins - mean) - 0.5) / sd
  return Math.max(0, Math.min(1, 2 * (1 - normCdf(z))))
}
// Wilson score interval for a proportion (as %).
function wilson(wins, decided, z = 1.96) {
  if (decided === 0) return { lo: null, hi: null }
  const p = wins / decided
  const d = 1 + (z * z) / decided
  const c = p + (z * z) / (2 * decided)
  const h = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * decided)) / decided)
  return { lo: Math.round(1000 * ((c - h) / d)) / 10, hi: Math.round(1000 * ((c + h) / d)) / 10 }
}
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100)
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000)

// ---- grading (mirrors frozen eval-protocol sign conventions) ---------------
// realized = actual_margin - market_implied_home_margin ; >0 HOME covered.
// A bet on betSign (+1 home / -1 away) WINS iff sign(betSign)==sign(realized).
function grade(bets) {
  let wins = 0, losses = 0, pushes = 0
  for (const b of bets) {
    const realized = b.actual_margin - b.mihm
    if (realized === 0) { pushes++; continue }
    if (Math.sign(b.betSign) === Math.sign(realized)) wins++
    else losses++
  }
  const decided = wins + losses
  const units = Math.round((wins * 0.909 - losses) * 100) / 100
  return {
    qualifying: bets.length, wins, losses, pushes, decided,
    winPct: decided ? r1((100 * wins) / decided) : null,
    units, roiPct: decided ? r1((100 * units) / decided) : null,
  }
}

// ---- signal construction (leakage-safe; a-priori constants only) -----------
function ratingImpliedMargin(homeRating, awayRating, neutral) {
  if (!finite(homeRating) || !finite(awayRating)) return null
  return homeRating - awayRating + (neutral ? 0 : HFA)
}
function buildSignals(g) {
  const neutral = !!g.neutral_site
  const mihm = g.market_implied_home_margin
  const s = {}
  // Elo (elo_diff already home-minus-away in Elo points)
  s.elo = finite(g.elo_diff) ? g.elo_diff / ELO_DIV + (neutral ? 0 : HFA) : null
  s.sp = ratingImpliedMargin(g.home_prior_sp, g.away_prior_sp, neutral)
  s.fpi = ratingImpliedMargin(g.home_prior_fpi, g.away_prior_fpi, neutral)
  s.form = ratingImpliedMargin(g.home_avg_margin, g.away_avg_margin, neutral)
  const dis = {}
  for (const k of ["elo", "sp", "fpi", "form"]) dis[k] = s[k] == null || !finite(mihm) ? null : s[k] - mihm
  return { impliedMargins: s, disagreements: dis }
}

async function main() {
  const pool = makePool()
  const q = async (sql, p = []) => (await pool.query(sql, p)).rows
  try {
    // ---- Load the OOS universe: distinct games that have frozen predictions --
    const predRows = await q(`select model, family, "gameId", predicted_edge, market_implied_home_margin, actual_margin, season
                              from hist_phase5_predictions`)
    const oosGameIds = [...new Set(predRows.map((r) => Number(r.gameId)))]
    console.log(`Frozen Phase 5 OOS predictions: ${predRows.length} rows across ${oosGameIds.length} distinct games.`)

    const feat = await q(
      `select t.*, g."homeConference" home_conf, g."awayConference" away_conf
         from hist_training_rows t
         left join hist_raw_games g on g."gameId" = t."gameId"
        where t."gameId" = any($1::bigint[])`,
      [oosGameIds],
    )
    const byId = new Map(feat.map((r) => [Number(r.gameId), r]))
    console.log(`Joined ${feat.length} feature rows for the OOS universe.`)

    // model_implied_home_margin = market_implied + predicted_edge ; store per combo.
    const combos = [...new Set(predRows.map((r) => `${r.family}::${r.model}`))].sort()
    const edgeByCombo = new Map(combos.map((c) => [c, new Map()]))
    for (const r of predRows) edgeByCombo.get(`${r.family}::${r.model}`).set(Number(r.gameId), Number(r.predicted_edge))

    // ---- base game objects with signals + market + outcome ------------------
    const games = []
    for (const gid of oosGameIds) {
      const g = byId.get(gid)
      if (!g) continue
      // hist_training_rows stores market_spread (home negative = favored). The
      // frozen convention: market_implied_home_margin = -market_spread.
      const mihm = g.market_spread != null ? -Number(g.market_spread) : null
      const am = g.actual_margin != null ? Number(g.actual_margin) : null
      if (!finite(mihm) || !finite(am)) continue
      const sig = buildSignals({ ...g, market_implied_home_margin: mihm })
      games.push({
        gameId: gid, season: Number(g.season), week: g.week == null ? null : Number(g.week),
        anomalous: !!g.is_anomalous_season, neutral: !!g.neutral_site, conf_game: !!g.conference_game,
        homeTeam: g.homeTeam, awayTeam: g.awayTeam, homeConf: g.home_conf, awayConf: g.away_conf,
        mihm, actual_margin: am, ...sig,
      })
    }
    const testSeasons = [...new Set(games.map((g) => g.season))].sort((a, b) => a - b)
    console.log(`Usable OOS games: ${games.length}. Test seasons: ${testSeasons.join(", ")}`)

    // ======================= SIGN-CONVENTION ASSERTIONS =====================
    console.log("\n=== SIGN-CONVENTION ASSERTIONS (must pass before scoring) ===")
    const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`); console.log(`  ok  ${msg}`) }
    // (1) Perfect hindsight bet (sign of realized) => 100% ; anti => 0%.
    const perfect = grade(games.map((g) => ({ betSign: Math.sign(g.actual_margin - g.mihm) || 1, mihm: g.mihm, actual_margin: g.actual_margin })))
    const anti = grade(games.map((g) => ({ betSign: -(Math.sign(g.actual_margin - g.mihm) || 1), mihm: g.mihm, actual_margin: g.actual_margin })))
    assert(perfect.winPct === 100, `perfect-hindsight grader = 100% (got ${perfect.winPct})`)
    assert(anti.winPct === 0, `anti-hindsight grader = 0% (got ${anti.winPct})`)
    // (2) Always-bet-home ATS near 50% (market efficient-ish); sanity band 40-60.
    const alwaysHome = grade(games.map((g) => ({ betSign: 1, mihm: g.mihm, actual_margin: g.actual_margin })))
    assert(alwaysHome.winPct > 40 && alwaysHome.winPct < 60, `always-home ATS in [40,60] (got ${alwaysHome.winPct})`)
    console.log(`  (context) always-bet-home ATS = ${alwaysHome.winPct}% over ${alwaysHome.decided} decided`)
    // (3) market_implied_home_margin == -market_spread on a sample (frozen preds).
    const chk = await q(`select market_spread, market_implied_home_margin from hist_phase5_predictions
                          where market_spread is not null and market_implied_home_margin is not null limit 500`)
    assert(chk.every((r) => Math.abs(Number(r.market_implied_home_margin) + Number(r.market_spread)) < 1e-9),
      "market_implied_home_margin == -market_spread (500-row sample)")
    // (4) disagreement direction: for elo, a strongly positive disagreement should
    //     favor HOME — i.e. betting sign(disagreement) must not be systematically inverted.
    const eloBets = games.filter((g) => finite(g.disagreements.elo) && Math.abs(g.disagreements.elo) >= 6)
      .map((g) => ({ betSign: Math.sign(g.disagreements.elo), mihm: g.mihm, actual_margin: g.actual_margin }))
    const eloGraded = grade(eloBets)
    console.log(`  (context) elo-disagreement>=6 ATS = ${eloGraded.winPct}% over ${eloGraded.decided} decided (orientation sanity, not a result)`)

    // ============================ REGIME SCORING ============================
    // Build a qualifying-bet list for a regime instance, returns per-bet objects
    // carrying betSign + team/conf attribution for concentration tests.
    function betsForRegime(fam, T, universe) {
      const out = []
      for (const g of universe) {
        let betSign = null, absSignal = null, qualifies = false
        if (fam.id === "fade_large_favorites") {
          if (Math.abs(g.mihm) >= T) { qualifies = true; betSign = -Math.sign(g.mihm); absSignal = Math.abs(g.mihm) }
        } else if (fam.id === "back_large_favorites") {
          if (Math.abs(g.mihm) >= T) { qualifies = true; betSign = Math.sign(g.mihm); absSignal = Math.abs(g.mihm) }
        } else if (fam.id === "back_home_underdogs") {
          if (g.mihm <= -T) { qualifies = true; betSign = 1; absSignal = Math.abs(g.mihm) }
        } else if (fam.id === "back_road_underdogs") {
          if (g.mihm >= T) { qualifies = true; betSign = -1; absSignal = Math.abs(g.mihm) }
        } else if (fam.type === "feature_disagreement") {
          const key = fam.id.split("_")[0] // elo/sp/fpi/form
          const d = g.disagreements[key]
          if (finite(d) && Math.abs(d) >= T && Math.sign(d) !== 0) { qualifies = true; betSign = Math.sign(d); absSignal = Math.abs(d) }
        } else if (fam.id === "consensus_disagreement") {
          const ds = ["elo", "sp", "fpi", "form"].map((k) => g.disagreements[k]).filter((x) => finite(x) && Math.abs(x) >= 1)
          if (ds.length) {
            const pos = ds.filter((x) => x > 0).length, neg = ds.filter((x) => x < 0).length
            const agree = Math.max(pos, neg)
            if (agree >= T && pos !== neg) { qualifies = true; betSign = pos > neg ? 1 : -1; absSignal = agree }
          }
        }
        if (qualifies && betSign) {
          out.push({
            gameId: g.gameId, season: g.season, betSign, absSignal, mihm: g.mihm, actual_margin: g.actual_margin,
            betTeam: betSign > 0 ? g.homeTeam : g.awayTeam,
            betConf: betSign > 0 ? g.homeConf : g.awayConf,
          })
        }
      }
      return out
    }
    function betsForModelEdge(combo, T, universe) {
      const em = edgeByCombo.get(combo)
      const out = []
      for (const g of universe) {
        const e = em.get(g.gameId)
        if (!finite(e) || Math.abs(e) < T || Math.sign(e) === 0) continue
        const betSign = Math.sign(e)
        out.push({
          gameId: g.gameId, season: g.season, betSign, absSignal: Math.abs(e), mihm: g.mihm, actual_margin: g.actual_margin,
          betTeam: betSign > 0 ? g.homeTeam : g.awayTeam, betConf: betSign > 0 ? g.homeConf : g.awayConf,
        })
      }
      return out
    }

    // Evaluate one regime instance -> full stats incl per-season + excl2020.
    function evalInstance(id, T, bets) {
      const all = grade(bets)
      const exclu20 = grade(bets.filter((b) => b.season !== 2020))
      const bySeason = {}
      for (const s of testSeasons) {
        const gs = grade(bets.filter((b) => b.season === s))
        if (gs.decided > 0) bySeason[s] = { n: gs.decided, winPct: gs.winPct }
      }
      const seasonsAbove50 = Object.values(bySeason).filter((x) => x.winPct > 50).length
      const seasonsAboveBE = Object.values(bySeason).filter((x) => x.winPct > BREAKEVEN).length
      const w = wilson(exclu20.wins, exclu20.decided)
      const p = binomTwoSidedP(exclu20.wins, exclu20.decided)
      return {
        id, threshold: T, avgAbsSignal: r2(bets.reduce((a, b) => a + b.absSignal, 0) / (bets.length || 1)),
        avgMarketSpread: r2(bets.reduce((a, b) => a + Math.abs(b.mihm), 0) / (bets.length || 1)),
        all, excl2020: exclu20, wilson95_excl2020: w, rawBinomP_excl2020: r3(p),
        seasonsTracked: Object.keys(bySeason).length, seasonsAbove50, seasonsAboveBreakeven: seasonsAboveBE, bySeason,
      }
    }

    const results = []
    for (const fam of CONFIG.regimeFamilies) {
      if (fam.id === "model_edge") {
        for (const combo of combos) for (const T of fam.thresholds_absEdge) {
          const bets = betsForModelEdge(combo, T, games)
          results.push({ family: `model_edge[${combo}]`, ...evalInstance(`model_edge[${combo}]`, T, bets) })
        }
      } else {
        const Ts = fam.thresholds_T || fam.thresholds_absSignal || fam.thresholds_K
        for (const T of Ts) {
          const bets = betsForRegime(fam, T, games)
          results.push({ family: fam.id, ...evalInstance(fam.id, T, bets) })
        }
      }
    }
    console.log(`\nScored ${results.length} pre-registered regime instances (each a hypothesis).`)

    // ==================== MULTIPLE-COMPARISON CONTROL =======================
    const eligible = results.filter((r) => r.excl2020.decided >= MIN_DECIDED)
    const m = eligible.length
    // Bonferroni
    const bonfAlpha = 0.05 / Math.max(1, m)
    for (const r of eligible) {
      r.bonferroniSignificant = r.rawBinomP_excl2020 != null && r.rawBinomP_excl2020 < bonfAlpha
      r.rawSignificant = r.rawBinomP_excl2020 != null && r.rawBinomP_excl2020 < 0.05
    }
    // Benjamini-Hochberg FDR at q=0.10
    const qFdr = 0.10
    const sorted = [...eligible].filter((r) => r.rawBinomP_excl2020 != null).sort((a, b) => a.rawBinomP_excl2020 - b.rawBinomP_excl2020)
    let kMax = 0
    sorted.forEach((r, i) => { if (r.rawBinomP_excl2020 <= ((i + 1) / sorted.length) * qFdr) kMax = i + 1 })
    const bhCut = kMax > 0 ? sorted[kMax - 1].rawBinomP_excl2020 : -1
    for (const r of eligible) r.bhFdrSignificant = r.rawBinomP_excl2020 != null && r.rawBinomP_excl2020 <= bhCut

    console.log(`\n=== MULTIPLE-COMPARISON CONTROL ===`)
    console.log(`  eligible hypotheses (decided>=${MIN_DECIDED}, excl2020): ${m}`)
    console.log(`  Bonferroni alpha/cell: ${r3(bonfAlpha)}`)
    console.log(`  BH-FDR(q=${qFdr}) cutoff p: ${bhCut >= 0 ? r3(bhCut) : "none pass"}`)
    console.log(`  raw-significant: ${eligible.filter((r) => r.rawSignificant).length} | Bonferroni: ${eligible.filter((r) => r.bonferroniSignificant).length} | BH-FDR: ${eligible.filter((r) => r.bhFdrSignificant).length}`)

    // Top raw performers (by excl2020 win%, min decided).
    const topRaw = [...eligible].sort((a, b) => (b.excl2020.winPct || 0) - (a.excl2020.winPct || 0)).slice(0, 10)
    console.log(`\n=== TOP 10 RAW PERFORMERS (excl 2020, decided>=${MIN_DECIDED}) ===`)
    for (const r of topRaw) {
      console.log(`  ${r.family} T=${r.threshold} | ${r.excl2020.winPct}% (${r.excl2020.wins}-${r.excl2020.losses}, n=${r.excl2020.decided}) ` +
        `CI[${r.wilson95_excl2020.lo},${r.wilson95_excl2020.hi}] ROI ${r.excl2020.roiPct}% | seas>50:${r.seasonsAbove50}/${r.seasonsTracked} | ` +
        `rawP ${r.rawBinomP_excl2020} bonf:${r.bonferroniSignificant ? "Y" : "n"} bh:${r.bhFdrSignificant ? "Y" : "n"}`)
    }

    // ================= ROBUSTNESS: concentration + neighborhood =============
    // Candidates worth robustness = clear breakeven point estimate AND >=1 correction survived (or raw-sig near-profitable).
    const candidates = eligible.filter((r) => (r.excl2020.winPct || 0) > BREAKEVEN && (r.rawSignificant || r.bhFdrSignificant))
    const robustness = []
    for (const r of candidates) {
      // rebuild bets for this instance to run concentration
      let bets
      if (r.family.startsWith("model_edge[")) {
        const combo = r.family.slice("model_edge[".length, -1)
        bets = betsForModelEdge(combo, r.threshold, games).filter((b) => b.season !== 2020)
      } else {
        const fam = CONFIG.regimeFamilies.find((f) => f.id === r.family)
        bets = betsForRegime(fam, r.threshold, games).filter((b) => b.season !== 2020)
      }
      // team concentration
      const teamUnits = {}
      for (const b of bets) { const real = b.actual_margin - b.mihm; if (real === 0) continue; const u = Math.sign(b.betSign) === Math.sign(real) ? 0.909 : -1; teamUnits[b.betTeam] = (teamUnits[b.betTeam] || 0) + u }
      const bestTeam = Object.entries(teamUnits).sort((a, b) => b[1] - a[1])[0]?.[0]
      const confUnits = {}
      for (const b of bets) { const real = b.actual_margin - b.mihm; if (real === 0) continue; const u = Math.sign(b.betSign) === Math.sign(real) ? 0.909 : -1; confUnits[b.betConf] = (confUnits[b.betConf] || 0) + u }
      const bestConf = Object.entries(confUnits).sort((a, b) => b[1] - a[1])[0]?.[0]
      const exTeam = grade(bets.filter((b) => b.betTeam !== bestTeam))
      const exConf = grade(bets.filter((b) => b.betConf !== bestConf))
      robustness.push({
        family: r.family, threshold: r.threshold, base: r.excl2020.winPct,
        removeBestTeam: { team: bestTeam, winPct: exTeam.winPct, n: exTeam.decided },
        removeBestConf: { conf: bestConf, winPct: exConf.winPct, n: exConf.decided },
        concentrationDriven: (exTeam.winPct != null && exTeam.winPct <= BREAKEVEN) || (exConf.winPct != null && exConf.winPct <= BREAKEVEN),
      })
    }

    // Neighborhood: for each family that has a candidate, print the full threshold curve.
    const candFamilies = [...new Set(candidates.map((r) => r.family))]
    const neighborhoods = {}
    for (const famName of candFamilies) {
      neighborhoods[famName] = eligible.filter((r) => r.family === famName)
        .sort((a, b) => a.threshold - b.threshold)
        .map((r) => ({ T: r.threshold, winPct: r.excl2020.winPct, n: r.excl2020.decided, ciLo: r.wilson95_excl2020.lo }))
    }

    // ============================ CLASSIFICATION ============================
    function classifyFamily(famName) {
      const insts = eligible.filter((r) => r.family === famName)
      if (!insts.length) return { family: famName, label: "REJECTED", reason: "no eligible instance (decided<min)" }
      const best = insts.sort((a, b) => (b.excl2020.winPct || 0) - (a.excl2020.winPct || 0))[0]
      const rob = robustness.find((x) => x.family === famName && x.threshold === best.threshold)
      const nb = neighborhoods[famName]
      const neighborStable = nb ? nb.filter((x) => (x.winPct || 0) > 50).length >= Math.ceil(nb.length / 2) : false
      const profitable = best.wilson95_excl2020.lo != null && best.wilson95_excl2020.lo > BREAKEVEN
      const seasonsOk = best.seasonsAbove50 >= Math.ceil(best.seasonsTracked * 0.6)
      let label, reason
      if ((best.excl2020.winPct || 0) <= 50 || !best.rawSignificant) {
        label = "REJECTED"; reason = `best ${best.excl2020.winPct}% (raw p ${best.rawBinomP_excl2020}); no raw OOS signal`
      } else if (best.bhFdrSignificant && profitable && seasonsOk && neighborStable && rob && !rob.concentrationDriven) {
        label = "STRONG_CANDIDATE"; reason = "survives FDR + profitability + seasons + neighborhood + concentration"
      } else if ((best.bhFdrSignificant || best.rawSignificant) && seasonsOk && neighborStable && (!rob || !rob.concentrationDriven)) {
        label = "PROMISING_BUT_UNPROVEN"; reason = "multi-season + robust, but not profitability-proven or fails a correction"
      } else {
        label = "INTERESTING"; reason = "raw signal only; weak/inconsistent or concentration/correction fails"
      }
      return {
        family: famName, label, reason, bestThreshold: best.threshold, bestWinPct_excl2020: best.excl2020.winPct,
        wilson95: best.wilson95_excl2020, roiPct: best.excl2020.roiPct, rawP: best.rawBinomP_excl2020,
        bonferroni: best.bonferroniSignificant, bhFdr: best.bhFdrSignificant,
        seasonsAbove50: `${best.seasonsAbove50}/${best.seasonsTracked}`, neighborStable,
        concentrationDriven: rob ? rob.concentrationDriven : null,
      }
    }
    const allFamilies = [...new Set(results.map((r) => r.family))]
    const classifications = allFamilies.map(classifyFamily)

    console.log(`\n=== CLASSIFICATION ===`)
    for (const c of classifications.sort((a, b) => a.label.localeCompare(b.label))) {
      console.log(`  [${c.label}] ${c.family} — best T=${c.bestThreshold} ${c.bestWinPct_excl2020}% CI[${c.wilson95?.lo},${c.wilson95?.hi}] ROI${c.roiPct}% ` +
        `seas>50 ${c.seasonsAbove50} bh:${c.bhFdr ? "Y" : "n"} conc:${c.concentrationDriven === null ? "-" : c.concentrationDriven ? "DRIVEN" : "ok"} :: ${c.reason}`)
    }
    const strong = classifications.filter((c) => c.label === "STRONG_CANDIDATE")
    const promising = classifications.filter((c) => c.label === "PROMISING_BUT_UNPROVEN")

    // ---- persist machine-readable results -----------------------------------
    fs.writeFileSync(path.join(DIR, "phase7-results.json"), JSON.stringify({
      generatedAt: new Date().toISOString(),
      oosGames: games.length, testSeasons,
      hypothesesScored: results.length, eligibleHypotheses: m,
      multipleComparison: { bonferroniAlpha: r3(bonfAlpha), bhFdrQ: qFdr, bhCutoffP: bhCut >= 0 ? r3(bhCut) : null,
        rawSig: eligible.filter((r) => r.rawSignificant).length, bonfSig: eligible.filter((r) => r.bonferroniSignificant).length, bhSig: eligible.filter((r) => r.bhFdrSignificant).length },
      sanity: { perfect: perfect.winPct, anti: anti.winPct, alwaysHome: alwaysHome.winPct },
      topRaw: topRaw.map((r) => ({ family: r.family, T: r.threshold, winPct: r.excl2020.winPct, n: r.excl2020.decided, ci: r.wilson95_excl2020, roi: r.excl2020.roiPct, rawP: r.rawBinomP_excl2020, bh: r.bhFdrSignificant, seasonsAbove50: `${r.seasonsAbove50}/${r.seasonsTracked}` })),
      robustness, neighborhoods, classifications,
      verdict: { strongCandidates: strong.map((c) => c.family), promising: promising.map((c) => c.family),
        phase8Justified: strong.length > 0 },
      allInstances: results,
    }, null, 2))
    console.log(`\nWrote ${path.join(DIR, "phase7-results.json")}`)
    console.log(`\nVERDICT: strong=${strong.length} promising=${promising.length} -> Phase 8 ${strong.length ? "may be justified" : "NOT justified"}`)
  } finally {
    await pool.end()
  }
}
main().catch((e) => { console.error("PHASE7 ERROR:", e.message); console.error(e.stack); process.exit(1) })
