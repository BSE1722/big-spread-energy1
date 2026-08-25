// ---------------------------------------------------------------------------
// Stage 2 — backfill RAW CFBD datasets into hist_raw_* tables.
//
// API CONSERVATION: one request per (dataset, season[, seasonType]); results
// persisted verbatim. Reruns SKIP any (dataset, season, seasonType) already
// logged ok in hist_ingest_runs unless FORCE=1. All writes are idempotent
// upserts, so a rerun cannot create duplicates or corrupt existing rows.
// ---------------------------------------------------------------------------

import {
  makePool, cfbdGet, num, logIngest, alreadyIngested, getRequestCount,
  TRAIN_SEASONS, RATING_SEASONS, SEASON_TYPES,
} from "./lib.mjs"

const FORCE = process.env.FORCE === "1"
let sampledAdvanced = false
let sampledPpa = false

/** Multi-row upsert in chunks. columns: string[]; rows: any[][].
 *  Dedupes rows by the conflict-key columns (keeping the LAST occurrence) so a
 *  source that lists the same key twice in one season (e.g. CFBD talent listing
 *  a team twice) cannot trigger "ON CONFLICT ... cannot affect row a second
 *  time". Deterministic: last-wins by source order. */
async function upsert(pool, table, columns, conflict, updateCols, rows) {
  if (rows.length === 0) return 0
  // Derive conflict-key column indexes from the conflict clause.
  const keyCols = conflict.split(",").map((c) => c.replace(/["\s]/g, ""))
  const keyIdx = keyCols.map((c) => columns.indexOf(c))
  const byKey = new Map()
  for (const r of rows) {
    const k = keyIdx.map((i) => r[i]).join("\u0001")
    byKey.set(k, r)
  }
  rows = [...byKey.values()]

  const chunkSize = 200
  let total = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const cols = columns.map((c) => `"${c}"`).join(", ")
    const values = []
    const params = []
    let p = 1
    for (const r of chunk) {
      values.push(`(${columns.map(() => `$${p++}`).join(", ")})`)
      params.push(...r)
    }
    const update = updateCols.length
      ? `DO UPDATE SET ${updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")}`
      : "DO NOTHING"
    const sql = `INSERT INTO ${table} (${cols}) VALUES ${values.join(", ")}
                 ON CONFLICT (${conflict}) ${update}`
    const res = await pool.query(sql, params)
    total += res.rowCount ?? chunk.length
  }
  return rows.length
}

function coerceRating(v) {
  if (v && typeof v === "object") return num(v.rating)
  return num(v)
}

async function guard(pool, dataset, season, seasonType, fn) {
  if (!FORCE && (await alreadyIngested(pool, dataset, season, seasonType))) {
    console.log(`  skip ${dataset} ${season} ${seasonType ?? ""} (already ingested)`)
    return
  }
  const before = getRequestCount()
  const rows = await fn()
  const requests = getRequestCount() - before
  await logIngest(pool, { dataset, season, seasonType, requests, rowsUpserted: rows, status: "ok" })
  console.log(`  ok   ${dataset} ${season} ${seasonType ?? ""} — ${rows} rows, ${requests} req`)
}

// --------------------------- dataset ingesters -----------------------------

async function ingestGames(pool, season, seasonType) {
  const data = await cfbdGet(`/games?year=${season}&seasonType=${seasonType}&division=fbs`)
  const rows = data.map((g) => [
    g.id, season, g.week ?? null, seasonType,
    g.startDate ?? null, g.startTimeTBD ?? null, g.completed ?? null,
    g.neutralSite ?? null, g.conferenceGame ?? null, g.venueId ?? null,
    g.homeTeam ?? null, g.homeConference ?? null, g.homeClassification ?? null, g.homePoints ?? null,
    g.awayTeam ?? null, g.awayConference ?? null, g.awayClassification ?? null, g.awayPoints ?? null,
    g.homePregameElo ?? null, g.awayPregameElo ?? null, g.homePostgameElo ?? null, g.awayPostgameElo ?? null,
    JSON.stringify(g),
  ])
  const cols = ["gameId","season","week","seasonType","startDate","startTimeTBD","completed","neutralSite","conferenceGame","venueId","homeTeam","homeConference","homeClassification","homePoints","awayTeam","awayConference","awayClassification","awayPoints","homePregameElo","awayPregameElo","homePostgameElo","awayPostgameElo","raw"]
  return upsert(pool, "hist_raw_games", cols, `"gameId"`, cols.slice(1), rows)
}

async function ingestLines(pool, season, seasonType) {
  const data = await cfbdGet(`/lines?year=${season}&seasonType=${seasonType}`)
  const rows = []
  for (const g of data) {
    for (const l of g.lines ?? []) {
      rows.push([
        g.id, season, g.week ?? null, seasonType, l.provider,
        num(l.spread), num(l.spreadOpen), num(l.overUnder), num(l.overUnderOpen),
        num(l.homeMoneyline), num(l.awayMoneyline), JSON.stringify(l),
      ])
    }
  }
  const cols = ["gameId","season","week","seasonType","provider","spread","spreadOpen","overUnder","overUnderOpen","homeMoneyline","awayMoneyline","raw"]
  return upsert(pool, "hist_raw_lines", cols, `"gameId", provider`, cols.slice(5), rows)
}

async function ingestAdvanced(pool, season, seasonType) {
  const data = await cfbdGet(`/stats/game/advanced?year=${season}&seasonType=${seasonType}`)
  if (!sampledAdvanced && data[0]) {
    console.log("  [sample advanced]", JSON.stringify({ offense: Object.keys(data[0].offense ?? {}), defense: Object.keys(data[0].defense ?? {}) }))
    sampledAdvanced = true
  }
  const rows = data.map((r) => [
    r.gameId, season, r.week ?? null, r.team, r.opponent ?? null,
    num(r.offense?.ppa), num(r.offense?.successRate), num(r.offense?.explosiveness),
    num(r.defense?.ppa), num(r.defense?.successRate), num(r.defense?.explosiveness),
    JSON.stringify(r),
  ])
  const cols = ["gameId","season","week","team","opponent","off_ppa","off_success_rate","off_explosiveness","def_ppa","def_success_rate","def_explosiveness","raw"]
  return upsert(pool, "hist_raw_advanced", cols, `"gameId", team`, cols.slice(2), rows)
}

async function ingestPpa(pool, season, seasonType) {
  const data = await cfbdGet(`/ppa/games?year=${season}&seasonType=${seasonType}`)
  if (!sampledPpa && data[0]) {
    console.log("  [sample ppa]", JSON.stringify({ offense: data[0].offense, defense: data[0].defense }))
    sampledPpa = true
  }
  const rows = data.map((r) => [
    r.gameId, season, r.week ?? null, r.team, r.opponent ?? null,
    num(r.offense?.overall), num(r.defense?.overall), JSON.stringify(r),
  ])
  const cols = ["gameId","season","week","team","opponent","off_overall","def_overall","raw"]
  return upsert(pool, "hist_raw_ppa", cols, `"gameId", team`, cols.slice(2), rows)
}

async function ingestTalent(pool, season) {
  const data = await cfbdGet(`/talent?year=${season}`)
  const rows = data.map((r) => [num(r.year) ?? season, r.team ?? r.school, num(r.talent)])
  return upsert(pool, "hist_raw_talent", ["season","team","talent"], `season, team`, ["talent"], rows)
}

async function ingestRecruiting(pool, season) {
  const data = await cfbdGet(`/recruiting/teams?year=${season}`)
  const rows = data.map((r) => [num(r.year) ?? season, r.team ?? r.school, num(r.rank), num(r.points)])
  return upsert(pool, "hist_raw_recruiting", ["season","team","rank","points"], `season, team`, ["rank","points"], rows)
}

async function ingestReturning(pool, season) {
  const data = await cfbdGet(`/player/returning?year=${season}`)
  const rows = data.map((r) => [num(r.season) ?? season, r.team, num(r.totalPPA), num(r.percentPPA), JSON.stringify(r)])
  return upsert(pool, "hist_raw_returning", ["season","team","total_ppa","percent_ppa","raw"], `season, team`, ["total_ppa","percent_ppa","raw"], rows)
}

async function ingestSp(pool, season) {
  const data = await cfbdGet(`/ratings/sp?year=${season}`)
  const rows = data.filter((r) => r.team).map((r) => [num(r.year) ?? season, r.team, coerceRating(r.rating), coerceRating(r.offense), coerceRating(r.defense), coerceRating(r.specialTeams)])
  return upsert(pool, "hist_raw_sp", ["season","team","rating","offense","defense","specialTeams"], `season, team`, ["rating","offense","defense","specialTeams"], rows)
}

async function ingestSrs(pool, season) {
  const data = await cfbdGet(`/ratings/srs?year=${season}`)
  const rows = data.filter((r) => r.team).map((r) => [num(r.year) ?? season, r.team, coerceRating(r.rating)])
  return upsert(pool, "hist_raw_srs", ["season","team","rating"], `season, team`, ["rating"], rows)
}

async function ingestFpi(pool, season) {
  const data = await cfbdGet(`/ratings/fpi?year=${season}`)
  const rows = data.filter((r) => r.team).map((r) => [num(r.year) ?? season, r.team, num(r.fpi)])
  return upsert(pool, "hist_raw_fpi", ["season","team","fpi"], `season, team`, ["fpi"], rows)
}

// --------------------------------- main ------------------------------------

async function main() {
  const pool = makePool()
  try {
    console.log(`Backfill start (FORCE=${FORCE ? 1 : 0}). Train seasons ${TRAIN_SEASONS.join(",")}; rating seasons ${RATING_SEASONS.join(",")}.`)

    // Per-season, per-seasonType datasets.
    for (const season of TRAIN_SEASONS) {
      for (const st of SEASON_TYPES) {
        await guard(pool, "games", season, st, () => ingestGames(pool, season, st))
        await guard(pool, "lines", season, st, () => ingestLines(pool, season, st))
        await guard(pool, "advanced", season, st, () => ingestAdvanced(pool, season, st))
        await guard(pool, "ppa", season, st, () => ingestPpa(pool, season, st))
      }
    }

    // Annual preseason-safe features (train seasons only).
    for (const season of TRAIN_SEASONS) {
      await guard(pool, "talent", season, null, () => ingestTalent(pool, season))
      await guard(pool, "recruiting", season, null, () => ingestRecruiting(pool, season))
      await guard(pool, "returning", season, null, () => ingestReturning(pool, season))
    }

    // End-of-season ratings for prior-season priors (train seasons + 2014).
    for (const season of RATING_SEASONS) {
      await guard(pool, "sp", season, null, () => ingestSp(pool, season))
      await guard(pool, "srs", season, null, () => ingestSrs(pool, season))
      await guard(pool, "fpi", season, null, () => ingestFpi(pool, season))
    }

    console.log(`\nBackfill complete. CFBD requests this run: ${getRequestCount()}`)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error("BACKFILL ERROR:", e.message)
  process.exit(1)
})
