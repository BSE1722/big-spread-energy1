import { makePool, cfbdGet } from "./lib.mjs"
const pool = makePool()
const q = async (s, p = []) => (await pool.query(s, p)).rows
console.log("classification dist (2022 regular):", await q(`select "homeClassification" hc, count(*) c from hist_raw_games where season=2022 and "seasonType"='regular' group by 1 order by 2 desc`))
console.log("both-FBS completed games/season:", await q(`select season, count(*) c from hist_raw_games where "homeClassification"='fbs' and "awayClassification"='fbs' and completed=true and "homePoints" is not null group by season order by season`))
const t = await cfbdGet("/talent?year=2018")
const seen = {}, dup = []
for (const r of t) { if (seen[r.team]) dup.push(r.team); seen[r.team] = 1 }
console.log("talent 2018:", t.length, "dupTeams:", dup)
await pool.end()
