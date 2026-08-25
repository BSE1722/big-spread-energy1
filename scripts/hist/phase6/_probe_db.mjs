import { makePool } from "../lib.mjs"

// Phase 6 — zero-API-cost inspection of what we already stored.
const pool = makePool()
const q = async (s, p = []) => (await pool.query(s, p)).rows

console.log("=== CFBD lines: provider coverage by season (from hist_raw_lines) ===")
console.table(
  await q(`select season, provider, count(*) n
             from hist_raw_lines group by season, provider
            having count(*) > 0 order by season, n desc`),
)

console.log("\n=== CFBD lines: does the stored raw jsonb contain ANY timestamp/date key? ===")
const sampleRaw = await q(`select "gameId", provider, raw from hist_raw_lines
                            where provider = 'DraftKings' order by season desc limit 3`)
for (const r of sampleRaw) {
  console.log(`gameId=${r.gameId} provider=${r.provider} raw keys: ${JSON.stringify(Object.keys(r.raw))}`)
  console.log(`   raw = ${JSON.stringify(r.raw)}`)
}

console.log("\n=== DraftKings historical depth in CFBD lines (earliest/latest season) ===")
console.table(
  await q(`select provider, min(season) earliest, max(season) latest, count(*) n
             from hist_raw_lines
            where provider in ('DraftKings','Bovada','consensus','teamrankings','Caesars','William Hill')
            group by provider order by n desc`),
)

console.log("\n=== Situational feature raw material already present in hist_raw_games ===")
console.table(
  await q(`select
             count(*) games,
             count(*) filter (where "neutralSite") neutral,
             count(*) filter (where "conferenceGame") conf,
             count(*) filter (where "venueId" is not null) have_venueid,
             count(*) filter (where "startDate" is not null) have_kickoff_ts,
             count(*) filter (where "startTimeTBD") tbd_kickoff
           from hist_raw_games where "homeClassification"='fbs' and "awayClassification"='fbs'`),
)

console.log("\n=== venues table coverage (for travel/timezone/altitude) ===")
const vcols = await q(`select column_name from information_schema.columns where table_name='venues' order by ordinal_position`).catch(() => [])
console.log("venues columns:", vcols.map((r) => r.column_name).join(", ") || "(table absent)")
if (vcols.length) {
  console.table(await q(`select count(*) venues from venues`).catch(() => [{ err: "n/a" }]))
}

console.log("\n=== Weather: what did we store, and is the source forecast or archive? ===")
const wx = await q(`select count(*) n from game_weather`).catch(() => [{ n: "table absent" }])
console.log(`game_weather rows: ${wx[0].n}`)

await pool.end()
