// ---------------------------------------------------------------------------
// FINAL PHASE — STEP 2: SHADOW SIGNAL CAPTURE  (weekly, pre-kickoff)
//
// For each eligible game in the target season/week, score the FROZEN candidate
// on the leakage-safe as-of features and, when |edge| >= 1, write an IMMUTABLE
// shadow signal. A shadow signal is NOT an Official BSE Pick — it is a logged,
// reproducible, before-kickoff decision used only for prospective validation.
//
// DATA SOURCES (cost-controlled):
//   * features  : hist_training_rows for the target season (the SAME leakage-
//                 safe as-of reconstruction used for 2015-2023). During 2026 the
//                 existing 02-backfill + 03-reconstruct jobs populate these rows
//                 from CFBD; this script adds ZERO new CFBD calls.
//   * DK line   : loadSnapshot() reads the durable Blob snapshot the Board
//                 already maintains — ZERO new SGO calls. We reuse whatever the
//                 admin's normal odds refresh last captured.
//
// LEAKAGE GUARDS (hard):
//   * Only games with kickoff STRICTLY in the future at capture time are eligible
//     (a signal must provably exist before kickoff). Past/started games skipped.
//   * The DK snapshot used is the CURRENT snapshot; its snapshotAt is stored as
//     the signal's signal_line_at so we can prove it predates kickoff.
//   * Outcomes (home_points/away_points) are NEVER read here.
//
// IMMUTABILITY / DEDUP:
//   * bse_shadow_signal has a UNIQUE(model_hash, cfbd_game_id) constraint and an
//     immutability trigger. Re-running NEVER updates or duplicates a signal
//     (ON CONFLICT DO NOTHING). The first pre-kickoff capture wins, forever.
//
// USAGE:
//   node scripts/hist/final/12-capture-signals.mjs --season 2026 --week 5
//   (season/week default to the app's current season context if omitted)
// ---------------------------------------------------------------------------

import { makePool } from "../lib.mjs"
import { loadFrozenArtifact } from "./score-frozen.mjs"
import { runCapture, CaptureError, DEFAULT_MAX_SNAPSHOT_AGE_HOURS, FEATURE_SELECT } from "./capture-core.mjs"

// Re-exported so the readiness harness (15-readiness.mjs) keeps importing the
// EXACT same production SELECT from its historical location. The single source
// of truth now lives in capture-core.mjs (shared by the CLI and the Admin
// "Generate BSE Ratings" route) — a `select *` fixture would hide a column-
// omission bug like the one this list was fixed for.
export { FEATURE_SELECT }

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

async function main() {
  const artifact = loadFrozenArtifact()
  const season = Number(argVal("--season", process.env.BSE_SEASON))
  const weekArg = argVal("--week", process.env.BSE_WEEK)
  if (!Number.isFinite(season)) {
    console.error("Provide --season <year> (and optionally --week <n>).")
    process.exit(1)
  }

  const pool = makePool()
  const q = async (s, p = []) => (await pool.query(s, p)).rows

  try {
    // --- Load the current DraftKings snapshot (Blob; zero SGO calls) --------
    // The snapshot is a public blob JSON; read it directly to avoid bundling
    // app TS into a script. Same JSON the app's loadSnapshot() reads.
    const snap = await loadDkSnapshotFromBlob()
    const maxSnapshotAgeHours = Number(argVal("--max-snapshot-age-hours", DEFAULT_MAX_SNAPSHOT_AGE_HOURS))

    // Delegate to the SHARED capture core (single source of truth, also used by
    // the Admin "Generate BSE Ratings" route). All leakage/validity/immutability
    // guards and the zero-added-API-call guarantee live there.
    // NOTE: --week is the RAW provider week as stored in hist_training_rows.
    const summary = await runCapture({
      q,
      artifact,
      snapshot: snap,
      season,
      week: weekArg ? Number(weekArg) : undefined,
      maxSnapshotAgeHours,
    })

    console.log(`DK snapshot @ ${summary.snapshotAt} — age ${summary.snapshotAgeHours}h (<= ${maxSnapshotAgeHours}h ok).`)
    console.log(`feature rows for season ${season}${weekArg ? ` raw week ${weekArg}` : ""}: ${summary.featureRows}`)
    for (const s of summary.invalid) console.warn(`SKIP game ${s.gameId} (${s.matchup}): ${s.reason}`)
    console.log(`\n=== CAPTURE SUMMARY (model ${summary.modelHash.slice(0, 12)}) ===`)
    console.log(`DK snapshots recorded for tracked games  : ${summary.snapsRecorded}`)
    console.log(`evaluated (pre-kickoff, DK line present) : ${summary.evaluated}`)
    console.log(`fired |edge|>=1                          : ${summary.fired}`)
    console.log(`new immutable signals inserted           : ${summary.inserted}`)
    console.log(`already existed (dedup, unchanged)       : ${summary.skippedDup}`)
    console.log(`skipped — no DK line matched             : ${summary.skippedNoLine}`)
    console.log(`skipped — kickoff already passed         : ${summary.skippedStarted}`)
    console.log(`skipped — invalid/malformed features     : ${summary.skippedInvalid}`)
    console.log(`board display rows upserted (all valid)  : ${summary.evaluated}`)
    console.log(`\nADDED EXTERNAL API CALLS THIS RUN: ${summary.addedExternalApiCalls} (features from DB, DK line from existing Blob snapshot)`)
  } catch (err) {
    if (err instanceof CaptureError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  } finally {
    await pool.end()
  }
}

/**
 * Read the durable DraftKings snapshot straight from the public Blob JSON the
 * Board maintains. Uses the same pathname as lib/odds-snapshot.ts. This adds NO
 * SGO request — it only reads storage the admin refresh already wrote.
 */
async function loadDkSnapshotFromBlob() {
  const PATHNAME = "odds/draftkings-snapshot.json"
  // TRANSPORT ONLY (no signal semantics): read the SAME snapshot JSON the app
  // reads. `lib/odds-snapshot.ts` reads it through the authenticated
  // @vercel/blob SDK `get()` stream, which works from any environment; a plain
  // fetch() on the public blob URL is gated behind a 403 HTML "security
  // checkpoint" in some sandboxes. So we mirror the app: SDK get() first, then
  // fall back to list()+fetch(url/downloadUrl). This changes how the snapshot
  // is fetched, never what is scored or published.
  try {
    const blob = await import("@vercel/blob")

    // 1) Preferred: authenticated SDK stream (identical to the app path).
    if (typeof blob.get === "function") {
      try {
        const result = await blob.get(PATHNAME, { access: "public" })
        if (result?.stream) {
          const text = await new Response(result.stream).text()
          if (text && !text.trimStart().startsWith("<")) return JSON.parse(text)
        }
      } catch (e) {
        console.error("snapshot get() failed, trying URL fallback:", e.message)
      }
    }

    // 2) Fallback: locate the blob and fetch its bytes over HTTP.
    const { blobs } = await blob.list({ prefix: PATHNAME })
    const hit = blobs.find((b) => b.pathname === PATHNAME)
    if (!hit) return null
    for (const candidate of [hit.downloadUrl, hit.url].filter(Boolean)) {
      try {
        const res = await fetch(candidate)
        if (!res.ok) continue
        const text = await res.text()
        if (!text || text.trimStart().startsWith("<")) continue // HTML error page
        return JSON.parse(text)
      } catch {
        // try next candidate
      }
    }
    console.error("snapshot read failed: no transport returned parseable JSON")
    return null
  } catch (e) {
    console.error("snapshot read failed:", e.message)
    return null
  }
}

// Only run the capture when invoked directly (node .../12-capture-signals.mjs).
// When imported (e.g. by 15-readiness.mjs to reuse FEATURE_SELECT), do nothing.
import { pathToFileURL } from "node:url"
const isDirectRun = import.meta.url === pathToFileURL(process.argv[1] || "").href
if (isDirectRun) {
  main().catch((e) => {
    console.error("CAPTURE ERROR:", e.message, e.stack)
    process.exit(1)
  })
}
