// ---------------------------------------------------------------------------
// FINAL PHASE — STEP 3: AUTOMATIC GRADING  (after games go final)
//
// Grades each immutable shadow signal WITHOUT ever mutating it. Results are
// written to the SEPARATE bse_shadow_grade table, so a later re-grade can never
// rewrite the original decision.
//
// GRADING (explicit sign conventions — tested in verify-grade.mjs):
//   Spread orientation: signal_line_spread_side is the spread FROM OUR SIDE's
//   perspective (home spread if we took home; -home spread if we took away).
//   Our side "covers" when:  actualSideMargin + spread_side > 0.
//     actualSideMargin = (home-away) if side=home, (away-home) if side=away.
//   Result: WIN if cover margin > 0, PUSH if == 0, LOSS if < 0.
//
//   CLV (closing line value) vs the LAST pre-kickoff DK line:
//   Positive CLV == the line moved in our favor after we bet.
//     side=home: clv = finalPregameSpreadHome - signalSpreadHome ... expressed
//       so that a more-negative (steamed toward home) close is GOOD for a home
//       bet => clv = signalSpreadHome - finalPregameSpreadHome.
//     side=away: symmetric => clv = finalPregameSpreadHome - signalSpreadHome.
//   We store clv_points signed so + always means "we beat the closing line".
//
// FINAL SCORES come from hist_raw_games (backfilled historically; during 2026
// the existing CFBD backfill refreshes finals). NO new API calls here.
// ---------------------------------------------------------------------------

import { makePool } from "../lib.mjs"

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

/** ATS grade for our side given final margins and our side-perspective spread. */
export function gradeAts(side, homePoints, awayPoints, spreadSide) {
  const actualSideMargin = side === "home" ? homePoints - awayPoints : awayPoints - homePoints
  const cover = actualSideMargin + spreadSide // >0 win, ==0 push, <0 loss
  const result = cover > 0 ? "WIN" : cover < 0 ? "LOSS" : "PUSH"
  return { result, coverMargin: Number(cover.toFixed(2)), actualSideMargin }
}

/**
 * Signed CLV in points, from OUR side's perspective.
 * + means WE BEAT THE CLOSE: the number we bet was better than the closing
 *   number (we laid fewer points, or got more points, than the closing line).
 * - means the line moved against us after we bet.
 *
 * Both inputs are home-relative spreads. Convert to our side's spread:
 *   sideSpread = side==home ? spreadHome : -spreadHome
 * For a spread bettor a LARGER side-spread is better (e.g. -7 -> -6 laying
 * fewer, or +7 -> +8 getting more). We beat the close when OUR side-spread is
 * larger than the CLOSING side-spread, so CLV = ourSide - closeSide.
 *
 * Worked example: bet home -3, close home -6. You bought home 3 pts cheaper than
 * the market's close => +3 CLV.  sigSide=-3, finSide=-6 => -3 - (-6) = +3. ✓
 */
export function computeClv(side, signalSpreadHome, finalSpreadHome) {
  if (finalSpreadHome == null) return null
  const sigSide = side === "home" ? signalSpreadHome : -signalSpreadHome
  const finSide = side === "home" ? finalSpreadHome : -finalSpreadHome
  return Number((sigSide - finSide).toFixed(2))
}

async function main() {
  const season = Number(argVal("--season", process.env.BSE_SEASON))
  const pool = makePool()
  const q = async (s, p = []) => (await pool.query(s, p)).rows

  try {
    // Ungraded signals whose game is now final.
    const params = []
    let seasonClause = ""
    if (Number.isFinite(season)) { params.push(season); seasonClause = `and s.season = $1` }

    const rows = await q(
      `select s.id, s.cfbd_game_id, s.side, s.signal_line_spread_home, s.signal_line_spread_side,
              s.kickoff_at,
              g."homePoints" as home_points, g."awayPoints" as away_points
         from bse_shadow_signal s
         join hist_raw_games g on g."gameId" = s.cfbd_game_id::bigint
        left join bse_shadow_grade gr on gr.signal_id = s.id
        where gr.signal_id is null
          and g.completed = true and g."homePoints" is not null and g."awayPoints" is not null
          ${seasonClause}`,
      params,
    )
    console.log(`ungraded final signals: ${rows.length}`)

    let graded = 0, withClv = 0
    for (const r of rows) {
      const { result, coverMargin } = gradeAts(r.side, r.home_points, r.away_points, Number(r.signal_line_spread_side))

      // finalPregameLine: last DK snapshot STRICTLY before kickoff for this game.
      const fin = (
        await q(
          `select spread_home, observed_at from bse_dk_snapshot
            where cfbd_game_id = $1 and is_pre_kickoff = true
            order by observed_at desc limit 1`,
          [r.cfbd_game_id],
        )
      )[0]
      const finalSpreadHome = fin ? Number(fin.spread_home) : null
      const clv = computeClv(r.side, Number(r.signal_line_spread_home), finalSpreadHome)
      if (clv != null) withClv++

      await q(
        `insert into bse_shadow_grade
           (signal_id, home_points, away_points, actual_margin,
            ats_result, ats_cover_margin,
            final_pregame_spread_home, final_pregame_line_at, clv_points, has_clv)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (signal_id) do nothing`,
        [
          r.id, r.home_points, r.away_points, r.home_points - r.away_points,
          result, coverMargin,
          finalSpreadHome, fin?.observed_at ?? null, clv, clv != null,
        ],
      )
      graded++
    }

    console.log(`\n=== GRADE SUMMARY ===`)
    console.log(`newly graded signals : ${graded}`)
    console.log(`with CLV vs close    : ${withClv}`)
    console.log(`ADDED EXTERNAL API CALLS THIS RUN: 0 (finals from hist_raw_games, close from bse_dk_snapshot)`)
  } finally {
    await pool.end()
  }
}

// Only run main when invoked directly (allows importing the pure graders).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("GRADE ERROR:", e.message, e.stack); process.exit(1) })
}
