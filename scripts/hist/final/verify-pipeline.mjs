// ---------------------------------------------------------------------------
// END-TO-END PIPELINE TEST (synthetic, self-cleaning).
//
// Proves the shadow machinery works without waiting for the 2026 season and
// WITHOUT polluting real data. Uses a sentinel model_hash so nothing here can
// ever mix with real signals; deletes everything it created at the end.
//
// Verifies: insert signal -> immutability (UPDATE/DELETE blocked) -> dedup
// (second insert is a no-op) -> DK snapshot pre-kickoff flag -> grade writes to
// the separate table -> ATS + CLV match hand math -> re-grade is a no-op.
// ---------------------------------------------------------------------------
import { makePool } from "../lib.mjs"
import { gradeAts, computeClv } from "./13-grade.mjs"

const TEST_HASH = "TEST_SENTINEL_do_not_use_in_prod"
const TEST_GAME = "999999001"

async function main() {
  const pool = makePool()
  const q = async (s, p = []) => (await pool.query(s, p)).rows
  let ok = true
  const say = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) ok = false }

  try {
    // clean any prior test residue first
    await cleanup(q)

    const kickoff = new Date(Date.now() + 3 * 3600_000).toISOString() // 3h out
    const signalAt = new Date(Date.now() - 3600_000).toISOString()    // 1h ago (pre-kickoff)

    // --- INSERT a synthetic HOME -7 signal ---------------------------------
    const ins = await q(
      `insert into bse_shadow_signal
        (model_hash, candidate_id, cfbd_game_id, season, week, season_type,
         home_team, away_team, kickoff_at, side, predicted_edge,
         market_implied_home_margin, signal_line_spread_home, signal_line_spread_side,
         signal_line_price, signal_book, signal_line_at, feature_snapshot, dk_snapshot_at, captured_at)
       values ($1,'TEST',$2,2099,1,'regular','HomeU','AwayU',$3,'home',3.2,
               7,-7,-7,-110,'draftkings',$4,'{"synthetic":true}'::jsonb,$4,$4)
       returning id`,
      [TEST_HASH, TEST_GAME, kickoff, signalAt],
    )
    const sigId = ins[0].id
    say("signal inserted", !!sigId)

    // --- IMMUTABILITY: UPDATE and DELETE must both raise --------------------
    let updateBlocked = false
    try { await q(`update bse_shadow_signal set predicted_edge = 99 where id = $1`, [sigId]) }
    catch { updateBlocked = true }
    say("UPDATE on signal is blocked", updateBlocked)

    let deleteBlocked = false
    try { await q(`delete from bse_shadow_signal where id = $1`, [sigId]) }
    catch { deleteBlocked = true }
    say("DELETE on signal is blocked", deleteBlocked)

    // --- DEDUP: second insert for same (model_hash, game) is a no-op --------
    const dup = await q(
      `insert into bse_shadow_signal
        (model_hash, candidate_id, cfbd_game_id, season, week, season_type,
         home_team, away_team, kickoff_at, side, predicted_edge,
         market_implied_home_margin, signal_line_spread_home, signal_line_spread_side,
         signal_line_price, signal_book, signal_line_at, feature_snapshot, dk_snapshot_at, captured_at)
       values ($1,'TEST',$2,2099,1,'regular','HomeU','AwayU',$3,'home',3.2,
               7,-7,-7,-110,'draftkings',$4,'{"synthetic":true}'::jsonb,$4,$4)
       on conflict (model_hash, cfbd_game_id) do nothing
       returning id`,
      [TEST_HASH, TEST_GAME, kickoff, signalAt],
    )
    say("duplicate insert is a no-op", dup.length === 0)

    // --- DK snapshots: one pre-kickoff, one post-kickoff -------------------
    await q(
      `insert into bse_dk_snapshot (cfbd_game_id, observed_at, kickoff_at, spread_home, price_home, price_away, is_pre_kickoff)
       values ($1,$2,$3,-6,-110,-110,true) on conflict do nothing`,
      [TEST_GAME, new Date(Date.now() - 1800_000).toISOString(), kickoff], // 30m ago, pre-kickoff, close -6
    )
    const preClose = (await q(`select spread_home from bse_dk_snapshot where cfbd_game_id=$1 and is_pre_kickoff=true order by observed_at desc limit 1`, [TEST_GAME]))[0]
    say("final pre-kickoff DK line = -6", Number(preClose.spread_home) === -6)

    // --- GRADE with a hand-known final: home wins 31-21 (by 10) ------------
    const g = gradeAts("home", 31, 21, -7)   // cover = 10 - 7 = 3 => WIN
    const clv = computeClv("home", -7, -6)    // -6 - (-7) = +1 => beat the close
    say("ATS = WIN, cover +3", g.result === "WIN" && g.coverMargin === 3)
    say("CLV = +1 (beat close)", clv === 1)

    await q(
      `insert into bse_shadow_grade
        (signal_id, home_points, away_points, actual_margin, ats_result, ats_cover_margin,
         final_pregame_spread_home, final_pregame_line_at, clv_points, has_clv)
       values ($1,31,21,10,$2,$3,-6, now(), $4, true)
       on conflict (signal_id) do nothing`,
      [sigId, g.result, g.coverMargin, clv],
    )
    const grade = (await q(`select * from bse_shadow_grade where signal_id=$1`, [sigId]))[0]
    say("grade row written to SEPARATE table", !!grade && grade.ats_result === "WIN")

    // --- RE-GRADE is a no-op (results never rewrite) ------------------------
    const regrade = await q(
      `insert into bse_shadow_grade (signal_id, home_points, away_points, actual_margin, ats_result, ats_cover_margin, clv_points, has_clv)
       values ($1,0,0,0,'LOSS',-99,-99,true) on conflict (signal_id) do nothing returning signal_id`,
      [sigId],
    )
    const stillWin = (await q(`select ats_result from bse_shadow_grade where signal_id=$1`, [sigId]))[0].ats_result
    say("re-grade is a no-op (still WIN)", regrade.length === 0 && stillWin === "WIN")

    // --- Signal provably existed before kickoff ----------------------------
    const proof = (await q(`select (signal_line_at < kickoff_at) as before from bse_shadow_signal where id=$1`, [sigId]))[0]
    say("signal_line_at < kickoff_at (pre-kickoff proof)", proof.before === true)

    console.log(`\n${ok ? "PIPELINE OK — all invariants hold" : "PIPELINE FAILED"}`)
  } finally {
    await cleanup(q)
    console.log("cleaned up synthetic test rows.")
    await pool.end()
  }
  if (!ok) process.exit(1)
}

async function cleanup(q) {
  const ids = await q(`select id from bse_shadow_signal where model_hash=$1`, [TEST_HASH])
  for (const { id } of ids) await q(`delete from bse_shadow_grade where signal_id=$1`, [id])
  // The immutability trigger blocks deletes — drop it briefly, delete, restore.
  await q(`alter table bse_shadow_signal disable trigger trg_shadow_signal_immutable`)
  await q(`delete from bse_shadow_signal where model_hash=$1`, [TEST_HASH])
  await q(`alter table bse_shadow_signal enable trigger trg_shadow_signal_immutable`)
  await q(`delete from bse_dk_snapshot where cfbd_game_id=$1`, [TEST_GAME])
}

main().catch((e) => { console.error("PIPELINE TEST ERROR:", e.message, e.stack); process.exit(1) })
