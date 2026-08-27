import { makePool } from "../lib.mjs"
const p = makePool()
const q = async (s) => (await p.query(s)).rows
console.table(
  await q(
    `select season, count(*) n,
       count(*) filter (where market_spread is not null) mkt,
       count(*) filter (where is_anomalous_season) anom
     from hist_training_rows group by season order by season`,
  ),
)
console.log("columns:", (await q(`select * from hist_training_rows limit 1`)).map ? Object.keys((await q(`select * from hist_training_rows limit 1`))[0]).join(", ") : "n/a")
await p.end()
