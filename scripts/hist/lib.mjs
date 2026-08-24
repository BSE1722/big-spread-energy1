// ---------------------------------------------------------------------------
// BSE historical training archive — shared helpers.
//
// Deterministic, rerunnable, auditable. Used by the 01/02/03/04 stage scripts.
// Every CFBD request goes through cfbdGet(), which increments a per-process
// counter AND is logged per dataset in hist_ingest_runs so total API usage is
// auditable across separate runs.
//
// Run scripts with env sourced, e.g.:
//   set -a && source /vercel/share/.env.project && set +a && node scripts/hist/01-schema.mjs
// ---------------------------------------------------------------------------

import pg from "pg"

const CFBD_BASE_URL = "https://api.collegefootballdata.com"

export const FEATURE_VERSION = "hist-archive-v1"
// Seasons whose GAMES/lines/efficiency/preseason features are archived.
export const TRAIN_SEASONS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]
// Ratings backfilled one season earlier so 2015 can use a prior-season (2014)
// SP+/SRS/FPI value without leakage.
export const RATING_SEASONS = [2014, ...TRAIN_SEASONS]
export const ANOMALOUS_SEASONS = new Set([2020]) // COVID-shortened
export const SEASON_TYPES = ["regular", "postseason"]

// Market provider preference: prefer the book BSE serves live (DraftKings),
// then other majors, then consensus. Historical seasons often only have
// consensus — recorded transparently per row.
export const MARKET_PROVIDER_PRIORITY = [
  "DraftKings",
  "Bovada",
  "Caesars",
  "William Hill",
  "teamrankings",
  "numberfire",
  "consensus",
]

let requestCount = 0
export function getRequestCount() {
  return requestCount
}

export function makePool() {
  const { Pool } = pg
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured")
  return new Pool({ connectionString: process.env.DATABASE_URL })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * CFBD GET with the counter + light retry on 429/5xx. Returns parsed JSON.
 * Every call counts as one CFBD request against our conservation budget.
 */
export async function cfbdGet(path) {
  const apiKey = process.env.CFBD_API
  if (!apiKey) throw new Error("CFBD_API is not configured")
  const url = `${CFBD_BASE_URL}${path}`
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }

  let attempt = 0
  while (true) {
    attempt++
    requestCount++
    const res = await fetch(url, { headers })
    if (res.ok) {
      // Gentle pacing between successful calls to stay under CFBD rate limits.
      await sleep(700)
      return res.json()
    }
    if ((res.status === 429 || res.status >= 500) && attempt <= 6) {
      const backoff = 3000 * attempt // 3s,6s,9s,12s,15s,18s
      console.log(`  [retry ${attempt}] ${res.status} on ${path} — waiting ${backoff}ms`)
      await sleep(backoff)
      continue
    }
    throw new Error(`CFBD ${res.status} ${res.statusText} for ${path}`)
  }
}

export function num(v) {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function avg(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v))
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function round(v, dp = 4) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null
  const f = 10 ** dp
  return Math.round(v * f) / f
}

/** Record one ingest run for audit + request accounting. */
export async function logIngest(pool, row) {
  await pool.query(
    `INSERT INTO hist_ingest_runs
       (dataset, season, "seasonType", requests, "rowsUpserted", status, note, "finishedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())`,
    [row.dataset, row.season ?? null, row.seasonType ?? null, row.requests ?? 0, row.rowsUpserted ?? 0, row.status ?? "ok", row.note ?? null],
  )
}

/** Whether a (dataset, season, seasonType) already ingested ok — for skip-on-rerun. */
export async function alreadyIngested(pool, dataset, season, seasonType) {
  const { rows } = await pool.query(
    `SELECT 1 FROM hist_ingest_runs
     WHERE dataset=$1 AND season IS NOT DISTINCT FROM $2
       AND "seasonType" IS NOT DISTINCT FROM $3 AND status='ok' LIMIT 1`,
    [dataset, season ?? null, seasonType ?? null],
  )
  return rows.length > 0
}
