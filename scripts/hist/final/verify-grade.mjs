// ---------------------------------------------------------------------------
// ATS + CLV ORIENTATION TESTS (pure, no DB). Hand-computed cases prove the sign
// conventions are correct before any real grading. Run: node verify-grade.mjs
// ---------------------------------------------------------------------------
import { gradeAts, computeClv } from "./13-grade.mjs"

let pass = 0, fail = 0
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  got=${JSON.stringify(got)}${ok ? "" : ` want=${JSON.stringify(want)}`}`)
  ok ? pass++ : fail++
}

// ---- ATS ------------------------------------------------------------------
// Home favored by 7 (spreadHome = -7). We bet HOME (-7). Home wins by 10 => cover.
//   actualSideMargin = 10; cover = 10 + (-7) = 3 > 0 => WIN
check("home -7, win by 10 => WIN", gradeAts("home", 31, 21, -7).result, "WIN")
// Home wins by exactly 7 => push.
check("home -7, win by 7 => PUSH", gradeAts("home", 28, 21, -7).result, "PUSH")
// Home wins by 3 (< 7) => fails to cover => LOSS.
check("home -7, win by 3 => LOSS", gradeAts("home", 24, 21, -7).result, "LOSS")

// We bet AWAY as a +7 dog (home spread -7 => away side spread +7). Away loses by 3.
//   actualSideMargin = away-home = -3; sideSpread = +7; cover = -3 + 7 = 4 > 0 => WIN
check("away +7, lose by 3 => WIN", gradeAts("away", 24, 21, 7).result, "WIN")
// Away loses by 10 => cover = -10 + 7 = -3 < 0 => LOSS
check("away +7, lose by 10 => LOSS", gradeAts("away", 31, 21, 7).result, "LOSS")
// Away outright win by 5 as +7 dog => cover = 5 + 7 = 12 => WIN
check("away +7, win by 5 => WIN", gradeAts("away", 20, 25, 7).result, "WIN")

// ---- CLV ------------------------------------------------------------------
// Convention: +CLV means WE BEAT THE CLOSE (our number was better than close).
// Bet HOME at -7. Close steams to home -8 (home more favored). We laid only 7
// while the close lays 8 => we got the better number => +1 CLV.
//   sigSide=-7, finSide=-8, clv = -7 - (-8) = +1
check("home -7 -> close -8 => +1 CLV (we beat close)", computeClv("home", -7, -8), 1)
// Close drifts to home -6 (home less favored). We laid 7 vs close 6 => we got
// the worse number => -1 CLV.  sigSide=-7, finSide=-6, clv = -7 - (-6) = -1
check("home -7 -> close -6 => -1 CLV (line moved against us)", computeClv("home", -7, -6), -1)
// Bet AWAY at +7 (spreadHome -7). Close moves to home -8 => away +8. We got only
// +7 while close gives +8 => close is better => -1 CLV.
//   sigSide=+7, finSide=+8, clv = 7 - 8 = -1
check("away +7 -> close +8 => -1 CLV (line moved against us)", computeClv("away", -7, -8), -1)
// Close moves to home -6 => away +6. We got +7 vs close +6 => we got more points
// => +1 CLV.  sigSide=+7, finSide=+6, clv = 7 - 6 = +1
check("away +7 -> close +6 => +1 CLV (we beat close)", computeClv("away", -7, -6), 1)
// No close available => null
check("no close => null CLV", computeClv("home", -7, null), null)

console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILED`}  (${pass}/${pass + fail})`)
if (fail) process.exit(1)
