/**
 * Durable, MANUAL-ONLY DraftKings odds snapshot.
 *
 * The board reads whatever snapshot is stored here and shows those exact lines
 * until an admin explicitly triggers a refresh. Nothing on this path is time-
 * based: there is no background revalidation and no visitor-triggered upstream
 * call. Only `refreshSnapshot()` (admin action) ever hits SportsGameOdds.
 *
 * Storage: a single Vercel Blob at a stable pathname, overwritten on each
 * refresh and read back with token-authenticated private access (the connected
 * store denies unauthenticated public content reads). It contains only
 * sportsbook market data already shown on the Board. The prior snapshot's lines
 * are carried forward into each game's
 * lineHistory (opening / previous / current + movement) so line movement can be
 * computed later without changing the BSE model or UI.
 */

import { put, get, BlobNotFoundError } from "@vercel/blob"
import { buildFreshMatch, type SeasonContextLite } from "@/lib/board-build"
import type { GameWithOdds, LineHistory } from "@/lib/odds-match"

/**
 * Blob access mode for the odds snapshot + lock. The connected Blob store
 * serves content privately (token-authenticated origin reads); a "public"
 * content read of these objects is denied (403) by the store. Reads and writes
 * MUST use the same mode, so both are pinned to "private" here. `get(access:
 * "private")` authenticates the content read with BLOB_READ_WRITE_TOKEN and
 * works regardless of how the object was originally written.
 */
const BLOB_ACCESS = "private" as const

const SNAPSHOT_PATHNAME = "odds/draftkings-snapshot.json"
const LOCK_PATHNAME = "odds/refresh.lock.json"

/** A running refresh older than this is treated as stale (crashed) and cleared. */
const LOCK_STALE_MS = 2 * 60 * 1000

export interface OddsSnapshot {
  /** ISO timestamp this snapshot was captured (i.e. when the refresh ran). */
  snapshotAt: string
  /** ISO timestamp of the snapshot this one replaced (for movement context). */
  previousSnapshotAt: string | null
  season: number
  week: number
  seasonType: string
  matchedCount: number
  unmatchedCount: number
  unmatched: { cfbdId: string; matchup: string; reason: string }[]
  /** Frozen matched/unavailable games with their DraftKings markets. */
  games: GameWithOdds[]
}

export interface RefreshSummary {
  refreshed: number
  matched: number
  unmatched: number
  snapshotAt: string
  previousSnapshotAt: string | null
}

/* ------------------------------- Load / Save ------------------------------ */

/**
 * Read the stored snapshot. Returns null when none exists yet. NEVER triggers a
 * SportsGameOdds request — it only reads durable storage.
 */
export async function loadSnapshot(): Promise<OddsSnapshot | null> {
  try {
    const result = await get(SNAPSHOT_PATHNAME, { access: BLOB_ACCESS })
    if (!result || !result.stream) return null
    const text = await new Response(result.stream).text()
    if (!text) return null
    return JSON.parse(text) as OddsSnapshot
  } catch (err) {
    // A genuinely missing blob is the normal "no snapshot yet" state → null.
    if (err instanceof BlobNotFoundError) {
      console.log("[v0] loadSnapshot: no snapshot stored yet.")
      return null
    }
    // Any OTHER failure (e.g. a 403 access-mode mismatch) is NOT "no odds" — it
    // would silently blank every DraftKings line and drop all parlay legs. Log
    // loudly and still degrade to null, but make the real cause diagnosable.
    console.error("[v0] loadSnapshot: snapshot read FAILED (not a missing blob):", (err as Error)?.message)
    return null
  }
}

async function saveSnapshot(snapshot: OddsSnapshot): Promise<void> {
  await put(SNAPSHOT_PATHNAME, JSON.stringify(snapshot), {
    access: BLOB_ACCESS,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  })
}

/* --------------------------- Concurrency lock ----------------------------- */

interface RefreshLock {
  lockedAt: string
  released: boolean
}

async function readLock(): Promise<RefreshLock | null> {
  try {
    const result = await get(LOCK_PATHNAME, { access: BLOB_ACCESS })
    if (!result || !result.stream) return null
    const text = await new Response(result.stream).text()
    if (!text) return null
    return JSON.parse(text) as RefreshLock
  } catch {
    return null
  }
}

async function writeLock(lock: RefreshLock): Promise<void> {
  await put(LOCK_PATHNAME, JSON.stringify(lock), {
    access: BLOB_ACCESS,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  })
}

/**
 * Try to acquire the refresh lock. Prevents double-clicks / concurrent refreshes
 * from firing overlapping SGO pulls. A held-but-stale lock (crashed run older
 * than LOCK_STALE_MS) is reclaimed. Returns whether we got the lock.
 *
 * Note: Blob has no atomic compare-and-swap, so this is a best-effort guard for
 * a single admin user rather than a distributed mutex — sufficient to stop the
 * realistic case (impatient double-clicks) without adding a database.
 */
export async function acquireRefreshLock(): Promise<{ acquired: boolean; heldSince: string | null }> {
  const existing = await readLock()
  const now = Date.now()
  if (existing && !existing.released) {
    const age = now - Date.parse(existing.lockedAt)
    if (Number.isFinite(age) && age < LOCK_STALE_MS) {
      return { acquired: false, heldSince: existing.lockedAt }
    }
  }
  await writeLock({ lockedAt: new Date(now).toISOString(), released: false })
  return { acquired: true, heldSince: null }
}

/** Release the refresh lock. Safe to call even if it was never acquired. */
export async function releaseRefreshLock(): Promise<void> {
  try {
    await writeLock({ lockedAt: new Date().toISOString(), released: true })
  } catch (err) {
    console.log("[v0] releaseRefreshLock failed (non-fatal):", (err as Error)?.message)
  }
}

/* ------------------------------ Line movement ----------------------------- */

/** Carry a prior game's lines forward so opening/previous/movement are tracked. */
function withLineMovement(next: GameWithOdds, prev: GameWithOdds | undefined): LineHistory {
  const curSpread = next.market.spread.home
  const curTotal = next.market.total.points

  if (!prev) {
    // First time we've seen this game: opening === current, no movement yet.
    return {
      openingSpread: curSpread,
      previousSpread: null,
      currentSpread: curSpread,
      spreadMovement: null,
      openingTotal: curTotal,
      previousTotal: null,
      currentTotal: curTotal,
      totalMovement: null,
    }
  }

  const ph = prev.lineHistory
  const openingSpread = ph.openingSpread ?? prev.market.spread.home ?? curSpread
  const previousSpread = prev.market.spread.home
  const openingTotal = ph.openingTotal ?? prev.market.total.points ?? curTotal
  const previousTotal = prev.market.total.points

  return {
    openingSpread,
    previousSpread,
    currentSpread: curSpread,
    spreadMovement:
      curSpread != null && previousSpread != null ? Number((curSpread - previousSpread).toFixed(2)) : null,
    openingTotal,
    previousTotal,
    currentTotal: curTotal,
    totalMovement:
      curTotal != null && previousTotal != null ? Number((curTotal - previousTotal).toFixed(2)) : null,
  }
}

/* -------------------------------- Refresh --------------------------------- */

/**
 * MANUAL refresh (admin-only). Pulls fresh CFBD + SGO/DraftKings, matches them
 * with the validated logic, folds in line movement vs the prior snapshot, saves
 * the new snapshot, and returns a summary. This is the ONLY function that hits
 * SportsGameOdds.
 */
export async function refreshSnapshot(ctx: SeasonContextLite): Promise<RefreshSummary> {
  const previous = await loadSnapshot()
  const prevByCfbdId = new Map<string, GameWithOdds>()
  if (previous) for (const g of previous.games) prevByCfbdId.set(g.cfbdId, g)

  // The full fetch + match runs BEFORE we touch storage. If this throws (e.g.
  // SgoRateLimitError on 429), we return without ever calling saveSnapshot, so
  // the existing frozen snapshot is left exactly as-is.
  const { match } = await buildFreshMatch(ctx)

  // Atomicity guard: never overwrite a good snapshot with an empty result.
  if (match.games.length === 0) {
    throw new Error("Refresh produced no games; existing snapshot was not changed.")
  }

  const games: GameWithOdds[] = match.games.map((g) => ({
    ...g,
    lineHistory: withLineMovement(g, prevByCfbdId.get(g.cfbdId)),
  }))

  const snapshotAt = new Date().toISOString()
  const snapshot: OddsSnapshot = {
    snapshotAt,
    previousSnapshotAt: previous?.snapshotAt ?? null,
    season: ctx.season,
    week: ctx.week,
    seasonType: ctx.seasonType,
    matchedCount: match.matchedCount,
    unmatchedCount: match.unmatchedCount,
    unmatched: match.unmatched,
    games,
  }

  await saveSnapshot(snapshot)

  return {
    refreshed: games.length,
    matched: match.matchedCount,
    unmatched: match.unmatchedCount,
    snapshotAt,
    previousSnapshotAt: snapshot.previousSnapshotAt,
  }
}
