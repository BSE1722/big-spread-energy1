import { makePool } from "./lib.mjs"
const pool = makePool()
const q = async (s, p = []) => (await pool.query(s, p)).rows

console.log("=== ingest status by dataset (ok vs not) ===")
console.table(await q(`select dataset, status, count(*)::int n, sum("rowsUpserted")::int rows, sum(requests)::int reqs
  from hist_ingest_runs group by dataset, status order by dataset, status`))

console.log("=== any failures ===")
const fails = await q(`select dataset, season, status, note from hist_ingest_runs where status <> 'ok' order by dataset, season`)
console.log(fails.length ? fails : "none")

console.log(`=== total CFBD requests logged: ${(await q(`select coalesce(sum(requests),0)::int t from hist_ingest_runs`))[0].t} ===`)

console.log("=== raw table row counts ===")
for (const t of ["hist_raw_games","hist_raw_advanced","hist_raw_ppa","hist_raw_lines","hist_raw_sp","hist_raw_srs","hist_raw_fpi","hist_raw_talent","hist_raw_recruiting","hist_raw_returning"]) {
  const [{ n }] = await q(`select count(*)::int n from ${t}`)
  console.log(`${t.padEnd(24)} ${n}`)
}

await pool.end()
