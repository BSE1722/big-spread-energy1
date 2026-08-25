// Phase 6 — minimal external availability probes. READ-ONLY, tightly counted.
// No backfill: every call uses the smallest window/limit that answers the
// availability/fields/timestamp/depth question.

let CFBD = 0, SGO = 0, OM = 0
const cfbdKey = process.env.CFBD_API
const sgoKey = process.env.SGO_API
const cfbdH = { Authorization: `Bearer ${cfbdKey}`, Accept: "application/json" }
const sgoH = { "x-api-key": sgoKey, Accept: "application/json" }

async function get(url, headers) {
  const r = await fetch(url, { headers, cache: "no-store" })
  let body = null
  try { body = await r.json() } catch { body = null }
  return { status: r.status, ok: r.ok, body }
}
const keysOf = (o) => (o && typeof o === "object" ? Object.keys(o) : [])

console.log("################ PRIORITY 1 — SGO (DraftKings, timestamped) ################")
// 1a. Account usage / tier — tells us entity caps and whether history is in-plan.
SGO++
{
  const u = await get("https://api.sportsgameodds.com/v2/account/usage", sgoH)
  console.log(`\n[SGO usage] status=${u.status}`)
  console.log(JSON.stringify(u.body?.data ?? u.body)?.slice(0, 900))
}
// 1b. RECENT event — confirm DraftKings odds carry a per-book lastUpdatedAt.
SGO++
{
  const r = await get(
    "https://api.sportsgameodds.com/v2/events?leagueID=NCAAF&bookmakerID=draftkings&oddsAvailable=true&limit=1",
    sgoH,
  )
  console.log(`\n[SGO recent events] status=${r.status} n=${Array.isArray(r.body?.data) ? r.body.data.length : "?"}`)
  const ev = r.body?.data?.[0]
  if (ev) {
    const firstOddKey = keysOf(ev.odds)[0]
    const odd = firstOddKey ? ev.odds[firstOddKey] : null
    const dk = odd?.byBookmaker?.draftkings
    console.log("  event top-level keys:", keysOf(ev).join(", "))
    console.log("  status.startsAt:", ev.status?.startsAt)
    console.log("  sample oddID:", firstOddKey)
    console.log("  DraftKings book object:", JSON.stringify(dk))
    // Does an odd carry any opening/history field?
    console.log("  odd-level keys (line-history hints?):", keysOf(odd).join(", "))
  }
}
// 1c. HISTORICAL depth — can we pull a 2019 game window at all on this tier?
SGO++
{
  const r = await get(
    "https://api.sportsgameodds.com/v2/events?leagueID=NCAAF&bookmakerID=draftkings&startsAfter=2019-11-01T00:00:00Z&startsBefore=2019-11-03T00:00:00Z&limit=1",
    sgoH,
  )
  const n = Array.isArray(r.body?.data) ? r.body.data.length : 0
  console.log(`\n[SGO 2019 window] status=${r.status} events=${n} error=${r.body?.error ?? ""}`)
  if (r.body?.data?.[0]) {
    const ev = r.body.data[0]
    const ok = keysOf(ev.odds)[0]
    console.log("  2019 event startsAt:", ev.status?.startsAt, " DK:", JSON.stringify(ev.odds?.[ok]?.byBookmaker?.draftkings))
  }
}
// 1d. Is there a dedicated line-history / odds-history endpoint on this tier?
SGO++
{
  const r = await get(
    "https://api.sportsgameodds.com/v2/events?leagueID=NCAAF&bookmakerID=draftkings&oddsAvailable=true&limit=1&includeOpposingOddIDs=false",
    sgoH,
  )
  console.log(`\n[SGO history-field scan] status=${r.status}`)
  const ev = r.body?.data?.[0]
  const ok = ev ? keysOf(ev.odds)[0] : null
  if (ok) console.log("  full odd object sample:", JSON.stringify(ev.odds[ok]).slice(0, 600))
}

console.log("\n################ PRIORITY 2/3 — CFBD player availability & value ################")
for (const [name, path] of [
  ["transfer portal", "/player/portal?year=2019"],
  ["player usage (QB)", "/player/usage?year=2019&team=Georgia&position=QB"],
  ["returning production", "/player/returning?year=2019&team=Georgia"],
  ["player season stats", "/stats/player/season?year=2019&team=Georgia&category=passing"],
  ["INJURIES (expect 404)", "/injuries?year=2019"],
  ["team roster (depth?)", "/roster?year=2019&team=Georgia"],
]) {
  CFBD++
  const r = await get(`https://api.collegefootballdata.com${path}`, cfbdH)
  const n = Array.isArray(r.body) ? r.body.length : r.ok ? 1 : 0
  console.log(`\n[CFBD ${name}] status=${r.status} rows=${n}`)
  if (Array.isArray(r.body) && r.body[0]) console.log("  keys:", keysOf(r.body[0]).join(", "))
  await new Promise((s) => setTimeout(s, 700))
}

console.log("\n################ PRIORITY 4 — Weather (historical, time-safe) ################")
// Athens, GA coords as a stand-in venue.
OM++
{
  const r = await get(
    "https://archive-api.open-meteo.com/v1/archive?latitude=33.95&longitude=-83.37&start_date=2019-11-02&end_date=2019-11-02&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,relative_humidity_2m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC",
    {},
  )
  const h = r.body?.hourly
  console.log(`\n[Open-Meteo ARCHIVE (ERA5, actual obs)] status=${r.status} hours=${h?.time?.length ?? 0}`)
  console.log("  hourly fields:", keysOf(h).join(", "))
  console.log("  sample noon temp/wind:", h?.temperature_2m?.[12], h?.wind_speed_10m?.[12])
}
OM++
{
  // Historical FORECAST API = stored PAST FORECASTS (time-safe pre-kickoff), limited depth.
  const r = await get(
    "https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=33.95&longitude=-83.37&start_date=2019-11-02&end_date=2019-11-02&hourly=temperature_2m&timezone=UTC",
    {},
  )
  console.log(`\n[Open-Meteo HISTORICAL-FORECAST 2019 probe] status=${r.status} hours=${r.body?.hourly?.time?.length ?? 0} reason=${r.body?.reason ?? ""}`)
}
OM++
{
  const r = await get(
    "https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=33.95&longitude=-83.37&start_date=2023-11-02&end_date=2023-11-02&hourly=temperature_2m&timezone=UTC",
    {},
  )
  console.log(`[Open-Meteo HISTORICAL-FORECAST 2023 probe] status=${r.status} hours=${r.body?.hourly?.time?.length ?? 0} reason=${r.body?.reason ?? ""}`)
}

console.log(`\n=== EXTERNAL REQUESTS USED — CFBD:${CFBD}  SGO:${SGO}  Open-Meteo:${OM}  TOTAL:${CFBD + SGO + OM} ===`)
