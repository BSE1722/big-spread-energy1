// ---------------------------------------------------------------------------
// Stage 4 — validate hist_training_rows. Read-only. Prints counts, null rates,
// and runs explicit LEAKAGE ASSERTIONS. Any failed assertion exits non-zero.
// ---------------------------------------------------------------------------

import { makePool } from "./lib.mjs"

const pool = makePool()
const q = async (s, p = []) => (await pool.query(s, p)).rows
const one = async (s, p = []) => (await q(s, p))[0]

let failures = 0
function assert(name, ok, detail = "") {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`)
  if (!ok) failures++
}

async function main() {
  try {
    // ---- Counts -----------------------------------------------------------
    console.log("=== row counts per season ===")
    console.table(await q(`select season, count(*)::int rows, sum(case when is_anomalous_season then 1 else 0 end)::int anomalous
      from hist_training_rows group by season order by season`))
    const [{ total }] = await q(`select count(*)::int total from hist_training_rows`)
    console.log(`TOTAL training rows: ${total}`)

    // ---- Null / coverage rates for key features --------------------------
    console.log("\n=== coverage (% non-null) for key features ===")
    const feats = [
      "home_elo_pregame","away_elo_pregame","home_talent","away_talent",
      "home_prior_sp","away_prior_sp","home_prior_fpi","away_prior_fpi",
      "home_returning_ppa","away_returning_ppa","home_recruiting_points",
      "home_avg_off_ppa","away_avg_off_ppa","home_avg_margin","away_avg_margin",
      "market_spread","market_spread_open","market_over_under","market_home_ml",
      "actual_margin",
    ]
    const covRows = []
    for (const f of feats) {
      const r = await one(`select round(100.0*count(${f})/count(*),1) pct from hist_training_rows`)
      covRows.push({ feature: f, pct_non_null: Number(r.pct) })
    }
    console.table(covRows)

    // Market provider mix.
    console.log("\n=== market provider mix ===")
    console.table(await q(`select coalesce(market_provider,'(none)') provider, count(*)::int rows,
      round(100.0*count(*)/sum(count(*)) over (),1) pct
      from hist_training_rows group by 1 order by 2 desc`))

    // ---- LEAKAGE ASSERTIONS ----------------------------------------------
    console.log("\n=== leakage assertions ===")

    // 1. Week-1 (no prior same-season games) MUST have null form + gp=0.
    const wk1 = await one(`select
        count(*) filter (where home_games_played_ytd = 0) gp0,
        count(*) filter (where home_games_played_ytd = 0 and home_avg_margin is not null) leak
      from hist_training_rows`)
    assert("season-openers have 0 prior games and NULL form (no form leakage)",
      Number(wk1.leak) === 0, `${wk1.gp0} opener-side rows, ${wk1.leak} with leaked form`)

    // 2. games_played_ytd never exceeds a sane cap (< 20) and is monotone w/ week.
    const gpMax = await one(`select max(home_games_played_ytd) hm, max(away_games_played_ytd) am from hist_training_rows`)
    assert("games_played_ytd within sane bounds (<20)", Number(gpMax.hm) < 20 && Number(gpMax.am) < 20, `home max ${gpMax.hm}, away max ${gpMax.am}`)

    // 3. prior_sp MUST equal the PRIOR season's raw SP+ (never current season).
    //    Spot-check: pick 200 rows and compare to hist_raw_sp[season-1].
    const spCheck = await one(`
      select count(*) checked,
             count(*) filter (where t.home_prior_sp is distinct from r.rating) mismatch
      from (select season, "homeTeam", home_prior_sp from hist_training_rows where home_prior_sp is not null limit 500) t
      join hist_raw_sp r on r.team = t."homeTeam" and r.season = t.season - 1`)
    assert("home_prior_sp equals PRIOR-season raw SP+ (no current-season rating leak)",
      Number(spCheck.mismatch) === 0, `${spCheck.checked} checked, ${spCheck.mismatch} mismatched`)

    // 4. prior_sp must NEVER coincidentally equal CURRENT-season SP+ when the two differ.
    //    Assert zero rows where home_prior_sp matches current-season value but not prior.
    const curLeak = await one(`
      select count(*) n
      from hist_training_rows t
      join hist_raw_sp cur on cur.team = t."homeTeam" and cur.season = t.season
      left join hist_raw_sp prev on prev.team = t."homeTeam" and prev.season = t.season - 1
      where t.home_prior_sp = cur.rating
        and (prev.rating is null or prev.rating <> cur.rating)`)
    assert("home_prior_sp never sourced from CURRENT-season SP+", Number(curLeak.n) === 0, `${curLeak.n} suspicious rows`)

    // 5. Label present for every row; actual_margin = home_points - away_points.
    const lab = await one(`select count(*) filter (where actual_margin is null or actual_margin <> home_points - away_points) bad from hist_training_rows`)
    assert("actual_margin consistent with scores on every row", Number(lab.bad) === 0, `${lab.bad} bad`)

    // 6. Elo pregame coverage should be high (>95%) — it is a core pregame feature.
    const eloCov = await one(`select round(100.0*count(home_elo_pregame)/count(*),1) pct from hist_training_rows`)
    assert("home_elo_pregame coverage > 95%", Number(eloCov.pct) > 95, `${eloCov.pct}%`)

    // ---- Sanity (not leakage): market spread should predict margin direction.
    console.log("\n=== sanity: market vs outcome (not a leakage check) ===")
    const sanity = await one(`
      select
        count(*) filter (where market_spread is not null) n,
        round(avg(case when market_spread is not null and ((-market_spread) * actual_margin) > 0 then 1.0 else 0.0 end)*100,1) pct_dir,
        round(corr(-market_spread, actual_margin::double precision)::numeric,3) corr
      from hist_training_rows`)
    console.log(`  market rows: ${sanity.n}; favorite-covers-direction rate: ${sanity.pct_dir}%; corr(-spread, margin): ${sanity.corr}`)
    console.log("  (expect ~65-75% direction and positive corr — confirms market field is oriented correctly)")

    console.log(`\n=== VALIDATION ${failures === 0 ? "PASSED" : "FAILED (" + failures + ")"} ===`)
    process.exitCode = failures === 0 ? 0 : 1
  } finally {
    await pool.end()
  }
}

main().catch((e) => { console.error("VALIDATE ERROR:", e.message); process.exit(1) })
