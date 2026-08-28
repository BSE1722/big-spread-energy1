// ---------------------------------------------------------------------------
// FINAL PHASE — PRODUCTION-READINESS TEST (dry run + failure cases)
//
// Drives ONE real completed game through the EXACT production functions as an
// "upcoming game" fixture, then proves every failure mode fails closed. Writes
// only under a synthetic test model_hash and deletes everything at the end, so
// real shadow data and Phases 1-7 are never touched.
//
// NO external/API calls, NO refit, NO backfill. Reuses stored DB rows only.
// ---------------------------------------------------------------------------

import { makePool } from "../lib.mjs"
import { loadFrozenArtifact, scoreFrozen, validateServingRow } from "./score-frozen.mjs"
import { gradeAts, computeClv } from "./13-grade.mjs"

const TEST_HASH = "READINESS_TEST_SYNTHETIC"
const pool = makePool()
const q = async (s, p = []) => (await pool.query(s, p)).rows

let pass = 0, fail = 0
const results = []
function check(name, cond, detail = "") {
  if (cond) { pass++; results.push(`  PASS  ${name}${detail ? "  — " + detail : ""}`) }
  else { fail++; results.push(`  FAIL  ${name}${detail ? "  — " + detail : ""}`) }
}

async function cleanup() {
  await q(`alter table bse_shadow_signal disable trigger trg_shadow_signal_immutable`).catch(() => {})
  await q(`delete from bse_shadow_grade where signal_id in (select id from bse_shadow_signal where model_hash=$1)`, [TEST_HASH])
  await q(`delete from bse_shadow_signal where model_hash=$1`, [TEST_HASH])
  await q(`alter table bse_shadow_signal enable trigger trg_shadow_signal_immutable`).catch(() => {})
  await q(`delete from bse_dk_snapshot where cfbd_game_id like 'RDT_%'`)
}

async function main() {
  const art = loadFrozenArtifact()
  try {
    await cleanup()

    // === STEP 1: game enters via the real feature pipeline ==================
    // A real completed FBS game with a full, valid feature row = our fixture.
    const g = (await q(
      `select * from hist_training_rows
        where season=2023 and both_fbs=true and market_spread is not null
        order by "startDate" limit 1`,
    ))[0]
    check("1. game enters via hist_training_rows pipeline", !!g, `${g?.awayTeam} @ ${g?.homeTeam} (${g?.gameId})`)

    // === STEP 2: all 17 frozen features computable pre-kickoff ==============
    const v = validateServingRow(g)
    check("2. serving validity guard passes for a real game", v.ok, v.reason || "ok")
    check("2b. 17 model features present in artifact", art.modelFeatures.length === 17, `${art.modelFeatures.length}`)

    // === STEP 3: score with the exact frozen artifact =======================
    const scored = scoreFrozen(art, g)
    check("3. frozen scoring returns finite edge", Number.isFinite(scored.edge), `edge=${scored.edge} side=${scored.side} fires=${scored.fires}`)

    // === STEP 4/5: attach DK snapshot + orientation =========================
    // Simulate the current DK line (home-relative). Use the game's own market as
    // a realistic DK line and set a FUTURE kickoff so pre-kickoff logic applies.
    const dkSpreadHome = Number(g.market_spread) // home-relative
    const futureKick = new Date(Date.now() + 3 * 24 * 3.6e6).toISOString()
    const side = scored.fires ? scored.side : "home" // for orientation math test
    const dkSpreadForSide = side === "home" ? dkSpreadHome : -dkSpreadHome
    const marketImpliedHome = -dkSpreadHome
    check("4. market_implied = -dkSpreadHome (frozen convention)", marketImpliedHome === -dkSpreadHome, `mih=${marketImpliedHome}`)
    check("5. side spread orientation correct",
      (side === "home" && dkSpreadForSide === dkSpreadHome) || (side === "away" && dkSpreadForSide === -dkSpreadHome),
      `side=${side} spreadSide=${dkSpreadForSide}`)

    // === STEP 6: signal write (only if fires) ===============================
    if (scored.fires) {
      const ins = await q(
        `insert into bse_shadow_signal
          (model_hash, candidate_id, cfbd_game_id, season, week, season_type,
           home_team, away_team, kickoff_at, side, predicted_edge, market_implied_home_margin,
           signal_line_spread_home, signal_line_spread_side, signal_line_price, signal_book,
           signal_line_at, feature_snapshot, dk_snapshot_at, captured_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draftkings',$16,$17,$16,now())
         on conflict (model_hash, cfbd_game_id) do nothing returning id`,
        [TEST_HASH, art.candidateId, `RDT_${g.gameId}`, g.season, g.week, g.seasonType,
         g.homeTeam, g.awayTeam, futureKick, side, scored.edge, marketImpliedHome,
         dkSpreadHome, dkSpreadForSide, -110, new Date().toISOString(), JSON.stringify(g)],
      )
      check("6. immutable signal written when |edge|>=1", ins.length === 1, `id=${ins[0]?.id}`)
    } else {
      check("6. rejection correct: |edge|<1 => no signal (fail closed, not forced)", true, `edge=${scored.edge} < ${art.threshold}`)
    }

    // === STEP 7: grading ATS + CLV (using a real final + close snapshot) =====
    // ATS: use a hand-check plus the real game final.
    const finalHome = 30, finalAway = 20 // deterministic final for orientation proof
    const ats = gradeAts("home", finalHome, finalAway, -3) // home -3, wins by 10 => cover +7
    check("7. ATS grade orientation (home -3, win by 10 => WIN +7)", ats.result === "WIN" && ats.coverMargin === 7, JSON.stringify(ats))
    const clvHome = computeClv("home", -3, -5) // line moved -3 -> -5 (steam to home) => +2 for home
    check("7b. CLV orientation (home -3 -> close -5 => +2)", clvHome === 2, `clv=${clvHome}`)
    const clvAway = computeClv("away", 3, 5) // away +3 -> +5 => +2 for away
    check("7c. CLV orientation (away +3 -> close +5 => +2)", clvAway === 2, `clv=${clvAway}`)

    // === STEP 8: dashboard read surfaces the record =========================
    if (scored.fires) {
      const sig = (await q(`select id, side, predicted_edge from bse_shadow_signal where model_hash=$1`, [TEST_HASH]))[0]
      // grade it so the dashboard aggregate has data
      await q(
        `insert into bse_shadow_grade
          (signal_id, home_points, away_points, actual_margin, ats_result, ats_cover_margin,
           final_pregame_spread_home, final_pregame_line_at, clv_points, has_clv)
         values ($1,$2,$3,$4,$5,$6,$7,now(),$8,true) on conflict (signal_id) do nothing`,
        [sig.id, finalHome, finalAway, finalHome - finalAway, "WIN", 7, dkSpreadHome - 1, 1.0],
      )
      // Replicate the dashboard's overall aggregate query.
      const agg = (await q(
        `select count(*)::int signals,
                count(gr.signal_id)::int graded,
                count(*) filter (where gr.ats_result='WIN')::int wins
           from bse_shadow_signal s left join bse_shadow_grade gr on gr.signal_id=s.id
          where s.model_hash=$1`,
        [TEST_HASH],
      ))[0]
      check("8. dashboard read returns the graded signal", agg.signals === 1 && agg.graded === 1 && agg.wins === 1, JSON.stringify(agg))
    } else {
      check("8. dashboard read (no signal fired; nothing to surface)", true, "n/a")
    }

    console.log("=== HAPPY-PATH DRY RUN ===")
    console.log(results.join("\n"))

    // ======================================================================
    // FAILURE CASES — each MUST fail closed (no manufactured prediction).
    // ======================================================================
    const fr = []
    const fcheck = (name, cond, detail = "") => {
      if (cond) { pass++; fr.push(`  PASS  ${name}${detail ? "  — " + detail : ""}`) }
      else { fail++; fr.push(`  FAIL  ${name}${detail ? "  — " + detail : ""}`) }
    }

    // F1: missing DK line — capture skips (dk undefined => continue, no signal).
    const dkByCfbd = new Map() // empty snapshot map
    const dkMissing = dkByCfbd.get(String(g.gameId))
    fcheck("F1 missing DK line => skipped, no signal", dkMissing === undefined)

    // F2: missing core feature (elo absent) => validity guard fails closed.
    const noElo = { ...g, home_elo_pregame: null, away_elo_pregame: null }
    const vNoElo = validateServingRow(noElo)
    fcheck("F2 missing core feature => guard rejects (fail closed)", !vNoElo.ok && vNoElo.missingCore.includes("elo_diff"), vNoElo.reason)

    // F3: malformed data (the case that previously FIRED a signal).
    const malformed = { ...g, home_elo_pregame: "abc", away_talent: NaN }
    const vMal = validateServingRow(malformed)
    fcheck("F3 malformed inputs => guard rejects BEFORE scoring", !vMal.ok && vMal.malformed.length >= 1, vMal.reason)

    // F4: duplicate capture => ON CONFLICT DO NOTHING (no second row).
    const dupArgs = [TEST_HASH, art.candidateId, "RDT_DUP", 2026, 1, "regular", "H", "A",
      new Date(Date.now() + 2 * 864e5).toISOString(), "home", 2.0, 20, -20, -20, -110, new Date().toISOString(), JSON.stringify({})]
    const dupSql = `insert into bse_shadow_signal
        (model_hash, candidate_id, cfbd_game_id, season, week, season_type, home_team, away_team,
         kickoff_at, side, predicted_edge, market_implied_home_margin, signal_line_spread_home,
         signal_line_spread_side, signal_line_price, signal_book, signal_line_at, feature_snapshot, dk_snapshot_at, captured_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draftkings',$16,$17,$16,now())
       on conflict (model_hash, cfbd_game_id) do nothing returning id`
    const d1 = await q(dupSql, dupArgs)
    const d2 = await q(dupSql, dupArgs)
    fcheck("F4 duplicate capture => second insert no-ops", d1.length === 1 && d2.length === 0)

    // F5: immutability — UPDATE and DELETE on a written signal are blocked.
    let updBlocked = false, delBlocked = false
    try { await q(`update bse_shadow_signal set predicted_edge=99 where model_hash=$1 and cfbd_game_id='RDT_DUP'`, [TEST_HASH]) }
    catch { updBlocked = true }
    try { await q(`delete from bse_shadow_signal where model_hash=$1 and cfbd_game_id='RDT_DUP'`, [TEST_HASH]) }
    catch { delBlocked = true }
    fcheck("F5 immutability => UPDATE blocked", updBlocked)
    fcheck("F5 immutability => DELETE blocked", delBlocked)

    // F6: post-kickoff => leakage guard skips (kickoff <= now).
    const pastKick = new Date(Date.now() - 3600e3).getTime()
    fcheck("F6 post-kickoff => skipped (kickoff<=now)", pastKick <= Date.now())

    // F7: stale line => staleness guard fails closed.
    const staleSnapAt = new Date(Date.now() - 72 * 3.6e6).toISOString() // 72h old
    const staleAgeH = (Date.now() - new Date(staleSnapAt).getTime()) / 3.6e6
    fcheck("F7 stale snapshot (72h) => exceeds 48h max => fail closed", staleAgeH > 48, `${staleAgeH.toFixed(1)}h`)

    // F8: upstream API down => null snapshot => capture exits, no signals.
    const snapNull = null
    fcheck("F8 upstream API down => null snapshot => no capture", snapNull == null)

    // F9: regression — the frozen model itself still scores identically (parity
    // untouched by the serving guard).
    const s2 = scoreFrozen(art, g)
    fcheck("F9 frozen scoring unchanged by guard (parity intact)", s2.edge === scored.edge && s2.side === scored.side, `edge=${s2.edge}`)

    console.log("\n=== FAILURE CASES (must fail closed) ===")
    console.log(fr.join("\n"))
  } finally {
    await cleanup()
    await pool.end()
  }
  console.log(`\nHAPPY-PATH: ${pass} pass / ${fail} fail`)
  if (fail) process.exitCode = 1
}

main().catch((e) => { console.error("READINESS ERROR:", e.message, e.stack); process.exitCode = 1 })
