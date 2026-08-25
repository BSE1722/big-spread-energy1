import { makePool } from "../lib.mjs"

// Phase 6 — quantify the consensus/proxy vs DraftKings gap using 2023, the ONE
// season where CFBD stored DraftKings alongside the historical proxies. This is
// the empirical basis for the train/serve mismatch discussion. Zero API cost.
const pool = makePool()
const q = async (s, p = []) => (await pool.query(s, p)).rows

for (const proxy of ["consensus", "Bovada", "William Hill (New Jersey)", "teamrankings"]) {
  const rows = await q(
    `select dk.spread dk, px.spread px, dk."overUnder" dk_ou, px."overUnder" px_ou
       from hist_raw_lines dk
       join hist_raw_lines px
         on px."gameId" = dk."gameId" and px.provider = $1
      where dk.provider = 'DraftKings' and dk.season = 2023
        and dk.spread is not null and px.spread is not null`,
    [proxy],
  )
  if (!rows.length) {
    console.log(`\n${proxy}: no overlapping games`)
    continue
  }
  let sumAbs = 0, exact = 0, within05 = 0, within1 = 0, sumSignedOu = 0, nOu = 0, sumAbsOu = 0
  for (const r of rows) {
    const d = Math.abs(Number(r.dk) - Number(r.px))
    sumAbs += d
    if (d === 0) exact++
    if (d <= 0.5) within05++
    if (d <= 1.0) within1++
    if (r.dk_ou != null && r.px_ou != null) {
      nOu++
      sumAbsOu += Math.abs(Number(r.dk_ou) - Number(r.px_ou))
      sumSignedOu += Number(r.dk_ou) - Number(r.px_ou)
    }
  }
  const n = rows.length
  console.log(`\n=== DraftKings 2023 vs ${proxy} (n=${n} overlapping games) ===`)
  console.log(`  SPREAD mean |DK - proxy| = ${(sumAbs / n).toFixed(3)} pts`)
  console.log(`  exact spread match:   ${((100 * exact) / n).toFixed(1)}%`)
  console.log(`  within 0.5 pt:        ${((100 * within05) / n).toFixed(1)}%`)
  console.log(`  within 1.0 pt:        ${((100 * within1) / n).toFixed(1)}%`)
  if (nOu) console.log(`  TOTAL mean |DK - proxy| = ${(sumAbsOu / nOu).toFixed(3)} pts (n=${nOu})`)
}

// Context: how big is a spread point vs the ATS breakeven margin? A key-number
// half-point around 3 and 7 routinely flips cover outcomes, so even a
// sub-point systematic proxy bias matters at the 52.38% breakeven.
console.log(`\nBreakeven ATS at -110 = 52.38%. Key numbers (3,7) mean small line
differences flip covers; interpret the above against that sensitivity.`)

await pool.end()
