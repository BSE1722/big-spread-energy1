/**
 * Durable, MANUAL-ONLY DraftKings odds snapshot.
 *
 * The board reads whatever snapshot is stored here and shows those exact lines
 * until an admin explicitly triggers a refresh. Nothing on this path is time-
 * based: there is no background revalidation and no visitor-triggered upstream
 * call. Only `refreshSnapshot()` (admin action) ever hits SportsGameOdds.
 *
 * Storage: a single Vercel Blob at a stable pathname, overwritten on each
 * refresh. It contains only sportsbook market data already shown on the Board.
 * The prior snapshot's lines are carried forward into each game's
 * lineHistory (opening / previous / current + movement) so line movement can be
 * computed later without changing the BSE model or UI.
 *
 * Read resilience: `get()` exposes two retrieval paths — access:"public" (the
 * public CDN URL) and access:"private" (a token-authenticated origin fetch).
 * In some runtimes one path intermittently returns 403 while the other
 * succeeds, and which one fails is not stable across environments. Reading with
 * a single hardcoded mode therefore silently blanks every DraftKings line and
 * drops all parlay legs whenever that mode is the one being refused. `readJson`
 * below tries BOTH paths (with a short retry) and only reports "no snapshot"
 * when the blob is genuinely absent, so the odds survive either path 403ing.
 */

import { put, get, head, BlobNotFoundError } from "@vercel/blob"
import { buildFreshMatch, type SeasonContextLite } from "@/lib/board-build"
import type { GameWithOdds, LineHistory } from "@/lib/odds-match"

/**
 * Access mode used for WRITES. Objects are stored public (the store's default),
 * but reads never assume this — see readJson, which is retrieval-path agnostic.
 */
const BLOB_WRITE_ACCESS = "public" as const

const SNAPSHOT_PATHNAME = "odds/draftkings-snapshot.json"
const LOCK_PATHNAME = "odds/refresh.lock.json"

/**
 * Read + parse a JSON blob resiliently. Returns null ONLY when the blob is
 * genuinely missing (BlobNotFoundError). Tries both retrieval paths because a
 * given runtime may 403 one of them; if every attempt fails for a reason other
 * than "not found", logs loudly and returns null so the caller degrades safely
 * instead of throwing.
 */
async function readJson<T>(pathname: string): Promise<T | null> {
  let sawNotFound = false
  let lastError: unknown = null

  const parse = (text: string | null): T | null => (text ? (JSON.parse(text) as T) : null)

  // Ordered list of independent retrieval strategies. Different runtimes/CDN
  // edges refuse different ones (public CDN vs token-authenticated origin), and
  // which one 403s is not stable across environments — so we try all of them.
  const strategies: Array<() => Promise<T | null>> = [
    // 1. Public CDN read.
    async () => {
      const r = await get(pathname, { access: "public" })
      return r?.stream ? parse(await new Response(r.stream).text()) : null
    },
    // 2. Token-authenticated origin read.
    async () => {
      const r = await get(pathname, { access: "private" })
      return r?.stream ? parse(await new Response(r.stream).text()) : null
    },
    // 3. head() metadata (token-authenticated) + fetch of its authenticated
    //    downloadUrl. Survives cases where both get() paths are refused.
    async () => {
      const meta = await head(pathname)
      const resp = await fetch(meta.downloadUrl, {
        headers: process.env.BLOB_READ_WRITE_TOKEN
          ? { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
          : undefined,
        cache: "no-store",
      })
      if (!resp.ok) throw new Error(`downloadUrl fetch ${resp.status}`)
      return parse(await resp.text())
    },
  ]

  // Two rounds so a transient blip that hits every strategy still recovers.
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const run of strategies) {
      try {
        return await run()
      } catch (err) {
        if (err instanceof BlobNotFoundError) {
          sawNotFound = true
          continue
        }
        lastError = err
      }
    }
    if (sawNotFound && lastError == null) break
  }

  if (sawNotFound && lastError == null) return null
  console.error(`[v0] readJson(${pathname}): all reads FAILED (blob likely exists but unreadable):`, (lastError as Error)?.message)
  return null
}

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
 * Last snapshot we successfully read, held in module memory. The snapshot is
 * IMMUTABLE between manual admin refreshes, so the copy we last read is still
 * authoritative during a transient blob-read outage.
 *
 * Why this exists: the Blob CDN intermittently 403s every retrieval path at once
 * for a short window (observed in logs; unreproducible seconds later). Without
 * this bridge, one such blip makes loadSnapshot() return null, which silently
 * blanks EVERY line on the customer Board and grades EVERY analyzer leg as
 * UNVERIFIED — presenting an infra blip as though the games have no odds. Serving
 * the last-good frozen snapshot through the blip is correct because that data
 * cannot have changed without an admin refresh (which updates this cache inline).
 */
let lastGoodSnapshot: { snapshot: OddsSnapshot; readAt: number } | null = null

/**
 * How long a transient outage may keep serving the last-good snapshot. Bridges
 * realistic blips (seconds to minutes) but eventually yields to the honest
 * "odds unavailable" state if the blob is unreadable for a prolonged period, so
 * a genuinely deleted snapshot is not served from memory forever.
 */
const SNAPSHOT_CACHE_TTL_MS = 30 * 60 * 1000

/**
 * Read the stored snapshot. Returns null when none exists yet. NEVER triggers a
 * SportsGameOdds request — it only reads durable storage.
 *
 * On a successful read, refreshes the in-memory last-good copy. When the live
 * read comes back empty (transient all-path 403, or a momentary miss), falls
 * back to that last-good copy while it is within the TTL rather than blanking
 * the board. Returns null only when we have no usable cached copy either.
 */
export async function loadSnapshot(): Promise<OddsSnapshot | null> {
  const fresh = await readJson<OddsSnapshot>(SNAPSHOT_PATHNAME)
  if (fresh) {
    lastGoodSnapshot = { snapshot: fresh, readAt: Date.now() }
    return fresh
  }

  if (lastGoodSnapshot && Date.now() - lastGoodSnapshot.readAt < SNAPSHOT_CACHE_TTL_MS) {
    console.warn(
      `[v0] loadSnapshot: live blob read unavailable; serving last-good snapshot read at ${new Date(
        lastGoodSnapshot.readAt,
      ).toISOString()} (frozen data, safe until next admin refresh)`,
    )
    return lastGoodSnapshot.snapshot
  }

  return null
}

async function saveSnapshot(snapshot: OddsSnapshot): Promise<void> {
  await put(SNAPSHOT_PATHNAME, JSON.stringify(snapshot), {
    access: BLOB_WRITE_ACCESS,
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
  return readJson<RefreshLock>(LOCK_PATHNAME)
}

async function writeLock(lock: RefreshLock): Promise<void> {
  await put(LOCK_PATHNAME, JSON.stringify(lock), {
    access: BLOB_WRITE_ACCESS,
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
  // Prime the last-good cache inline so this instance serves the brand-new
  // snapshot immediately, even if its next blob read happens to hit a 403 blip.
  lastGoodSnapshot = { snapshot, readAt: Date.now() }

  return {
    refreshed: games.length,
    matched: match.matchedCount,
    unmatched: match.unmatchedCount,
    snapshotAt,
    previousSnapshotAt: snapshot.previousSnapshotAt,
  }
}
