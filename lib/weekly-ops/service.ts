import "server-only"
import { pool } from "@/lib/db"
import { getCurrentContext } from "@/lib/bse/season"
import { rawWeekForCanonical } from "@/lib/bse/week-identity"
import { getCfbdGameLites } from "@/lib/board-build"
import { getBoardSignals } from "@/lib/board-signal/service"
import { loadSnapshot } from "@/lib/odds-snapshot"
import { getFrozenCandidate } from "@/lib/shadow/service"
import { loadFrozenArtifact } from "@/scripts/hist/final/score-frozen.mjs"

/**
 * WEEKLY OPERATIONS STATUS AGGREGATOR (read-only).
 *
 * Computes the state of every stage of the weekly workflow for the CANONICAL
 * current BSE week, entirely from real data. It performs NO mutations, NEVER
 * fabricates values, and adds NO external API calls beyond what the board
 * already loads (schedule + the existing DK blob snapshot; both cached). If a
 * data source is unavailable it reports BLOCKED/NEEDS ACTION — it never invents
 * a rating, price, feature, or odds line.
 */

export type StageStatus = "READY" | "NEEDS_ACTION" | "COMPLETE" | "BLOCKED"

export interface StageView {
  key: string
  title: string
  status: StageStatus
  /** One-line human summary of what the numbers say. */
  detail: string
  /** Optional extra lines (e.g. rejection reasons) shown under the summary. */
  notes?: string[]
}

export interface WeeklyOpsSnapshot {
  season: number
  /** Canonical BSE week (Week 0 opener resolves separately from Week 1). */
  week: number
  seasonType: string
  weekLabel: string
  model: { modelHash: string; nTrees: number | null; threshold: number | null } | null
  metrics: {
    scheduledGames: number
    gamesWithFeatures: number
    gamesWithDkOdds: number
    gamesWithRatings: number
    gamesWithoutRatings: number
    noRatingReasons: { reason: string; count: number }[]
    immutableShadowSignals: number
    officialPublishedPicks: number
    dkSnapshotAt: string | null
    dkSnapshotAgeHours: number | null
  }
  stages: StageView[]
  /** True only when the owner can operate the whole week from Admin right now. */
  operable: boolean
}

const MAX_SNAPSHOT_AGE_HOURS = 48

/** Bare-id normalizer (snapshot ids are "cfbd-<id>"; feature ids are bare). */
const normId = (v: string | number) => String(v).replace(/^cfbd-/, "")

export async function getWeeklyOpsSnapshot(): Promise<WeeklyOpsSnapshot> {
  const ctx = getCurrentContext()
  const season = ctx.season
  const canonicalWeek = ctx.week
  const rawWeek = rawWeekForCanonical(canonicalWeek)
  const weekLabel = canonicalWeek === 0 ? "Week 0 (opener)" : `Week ${canonicalWeek}`

  // --- Frozen model meta (never mutated here) -------------------------------
  // modelHash + threshold come from the DB frozen-candidate row; nTrees comes
  // from the committed artifact JSON (read-only). We NEVER retrain or alter it.
  let model: WeeklyOpsSnapshot["model"] = null
  try {
    const candidate = await getFrozenCandidate()
    if (candidate) {
      let nTrees: number | null = null
      try {
        const artifact = loadFrozenArtifact() as { gbt?: { trees?: unknown[] } }
        nTrees = Array.isArray(artifact.gbt?.trees) ? artifact.gbt!.trees!.length : null
      } catch {
        nTrees = null
      }
      model = { modelHash: candidate.modelHash, nTrees, threshold: candidate.threshold }
    }
  } catch {
    model = null
  }

  // --- Canonical schedule spine (same source the board renders) -------------
  // getCfbdGameLites already resolves the canonical slate for the week, so its
  // length is the authoritative "scheduled games" count for this BSE week.
  let games: Awaited<ReturnType<typeof getCfbdGameLites>> = []
  let scheduleAvailable = true
  try {
    games = await getCfbdGameLites(ctx)
  } catch {
    scheduleAvailable = false
    games = []
  }
  const scheduledGames = games.length
  const scheduleGameIds = new Set(games.map((g) => normId(g.id)))

  // --- Feature readiness (leakage-safe inputs sufficient to SCORE) ----------
  // Reuse the EXACT validity contract used at capture time: a game is
  // score-ready only when its raw-week feature row exists, is FBS-vs-FBS, and
  // has the two strongest inputs (Elo + market line) present. We do NOT
  // fabricate any missing input.
  let gamesWithFeatures = 0
  const featureIds = new Set<string>()
  try {
    const { rows } = await pool.query(
      `select "gameId"
         from hist_training_rows
        where season = $1 and week = $2 and both_fbs = true
          and home_elo_pregame is not null and away_elo_pregame is not null
          and market_spread is not null`,
      [season, rawWeek],
    )
    for (const r of rows) {
      const id = normId(r.gameId as string)
      // Only count features for games actually on this canonical slate.
      if (scheduleGameIds.size === 0 || scheduleGameIds.has(id)) {
        featureIds.add(id)
      }
    }
    gamesWithFeatures = featureIds.size
  } catch {
    gamesWithFeatures = 0
  }

  // --- DraftKings odds snapshot (existing blob; zero new SGO) ----------------
  let dkSnapshotAt: string | null = null
  let dkSnapshotAgeHours: number | null = null
  let gamesWithDkOdds = 0
  const dkIds = new Set<string>()
  try {
    const snap = await loadSnapshot()
    if (snap) {
      dkSnapshotAt = snap.snapshotAt
      dkSnapshotAgeHours = (Date.now() - new Date(snap.snapshotAt).getTime()) / 3.6e6
      for (const g of snap.games) {
        if (g.oddsStatus === "matched" && g.market?.available && g.market.spread?.home != null) {
          const id = normId(g.cfbdId)
          if (scheduleGameIds.size === 0 || scheduleGameIds.has(id)) dkIds.add(id)
        }
      }
      gamesWithDkOdds = dkIds.size
    }
  } catch {
    dkSnapshotAt = null
  }

  // --- BSE ratings already captured for this week ---------------------------
  let gamesWithRatings = 0
  try {
    const signals = await getBoardSignals(season, rawWeek)
    for (const id of signals.byGameId.keys()) {
      if (scheduleGameIds.size === 0 || scheduleGameIds.has(normId(id))) gamesWithRatings++
    }
  } catch {
    gamesWithRatings = 0
  }
  const gamesWithoutRatings = Math.max(0, scheduledGames - gamesWithRatings)

  // --- Why games have no rating (real reasons only, no fabrication) ---------
  const noRatingReasons: { reason: string; count: number }[] = []
  if (gamesWithoutRatings > 0) {
    const missingFeatures = Math.max(0, scheduledGames - gamesWithFeatures)
    const haveFeaturesNoOdds = Math.max(0, gamesWithFeatures - gamesWithDkOdds)
    // Games with features AND odds but still no rating are almost always
    // pre-kickoff-guard skips (kickoff already passed at last capture) or a
    // capture that hasn't been run yet.
    const featureAndOddsReady = Math.min(gamesWithFeatures, gamesWithDkOdds)
    const capturedShort = Math.max(0, featureAndOddsReady - gamesWithRatings)
    if (missingFeatures > 0)
      noRatingReasons.push({ reason: "Insufficient leakage-safe features (e.g. missing Elo/market line)", count: missingFeatures })
    if (haveFeaturesNoOdds > 0)
      noRatingReasons.push({ reason: "No matched DraftKings line in the current snapshot", count: haveFeaturesNoOdds })
    if (capturedShort > 0)
      noRatingReasons.push({ reason: "Feature+odds ready but not yet captured (run Generate BSE Ratings) or kickoff already passed", count: capturedShort })
  }

  // --- Immutable shadow signals for this week (raw week key) ----------------
  let immutableShadowSignals = 0
  try {
    const params: unknown[] = [season, rawWeek]
    const modelClause = model ? ` and model_hash = $3` : ""
    if (model) params.push(model.modelHash)
    const { rows } = await pool.query(
      `select count(*)::int n from bse_shadow_signal where season = $1 and week = $2${modelClause}`,
      params,
    )
    immutableShadowSignals = rows[0]?.n ?? 0
  } catch {
    immutableShadowSignals = 0
  }

  // --- Official published picks for this canonical week ---------------------
  // predictions.week stores the CANONICAL week, so query it directly.
  let officialPublishedPicks = 0
  try {
    const { rows } = await pool.query(
      `select count(*)::int n from predictions where season = $1 and week = $2`,
      [season, canonicalWeek],
    )
    officialPublishedPicks = rows[0]?.n ?? 0
  } catch {
    officialPublishedPicks = 0
  }

  // ==========================================================================
  // STAGE STATUS DERIVATION (from the real metrics above)
  // ==========================================================================
  const oddsFresh = dkSnapshotAgeHours != null && dkSnapshotAgeHours <= MAX_SNAPSHOT_AGE_HOURS

  // 1) Feature Readiness
  const featureReadiness: StageView = (() => {
    if (!scheduleAvailable)
      return { key: "features", title: "Feature Readiness", status: "BLOCKED", detail: "Schedule unavailable (provider quota/outage). Cannot assess feature readiness yet." }
    if (scheduledGames === 0)
      return { key: "features", title: "Feature Readiness", status: "BLOCKED", detail: `No scheduled games found for ${weekLabel}.` }
    if (gamesWithFeatures === 0)
      return { key: "features", title: "Feature Readiness", status: "NEEDS_ACTION", detail: `0 of ${scheduledGames} games have sufficient model inputs. Feature reconstruction must run before ratings.` }
    if (gamesWithFeatures < scheduledGames)
      return { key: "features", title: "Feature Readiness", status: "READY", detail: `${gamesWithFeatures} of ${scheduledGames} games have sufficient leakage-safe inputs. Remaining games will be skipped (never faked).` }
    return { key: "features", title: "Feature Readiness", status: "COMPLETE", detail: `All ${scheduledGames} games have sufficient leakage-safe inputs.` }
  })()

  // 2) Refresh DraftKings Lines
  const oddsRefresh: StageView = (() => {
    if (dkSnapshotAt == null)
      return { key: "odds", title: "Refresh DraftKings Lines", status: "NEEDS_ACTION", detail: "No DraftKings snapshot found. Refresh lines to enable rating capture." }
    const age = dkSnapshotAgeHours!.toFixed(1)
    if (!oddsFresh)
      return { key: "odds", title: "Refresh DraftKings Lines", status: "NEEDS_ACTION", detail: `Snapshot is stale: ${age}h old (> ${MAX_SNAPSHOT_AGE_HOURS}h). Refresh before capturing ratings.` }
    return { key: "odds", title: "Refresh DraftKings Lines", status: "COMPLETE", detail: `Snapshot is fresh: ${age}h old. ${gamesWithDkOdds} games have a usable line.` }
  })()

  // 3) Generate BSE Ratings
  const generateRatings: StageView = (() => {
    if (gamesWithFeatures === 0)
      return { key: "ratings", title: "Generate BSE Ratings", status: "BLOCKED", detail: "Blocked until features exist. Ratings are never generated from fabricated inputs." }
    if (!oddsFresh)
      return { key: "ratings", title: "Generate BSE Ratings", status: "BLOCKED", detail: "Blocked until a fresh DraftKings snapshot exists (fail-closed on stale odds)." }
    if (gamesWithRatings === 0)
      return { key: "ratings", title: "Generate BSE Ratings", status: "READY", detail: `Ready to score the frozen model on ${Math.min(gamesWithFeatures, gamesWithDkOdds)} feature+odds-ready games.` }
    return { key: "ratings", title: "Generate BSE Ratings", status: "COMPLETE", detail: `${gamesWithRatings} of ${scheduledGames} games rated. Re-run to refresh leans after a line move.` }
  })()

  // 4) Review Ratings
  const reviewRatings: StageView = (() => {
    if (gamesWithRatings === 0)
      return { key: "review", title: "Review Ratings", status: "BLOCKED", detail: "No ratings to review yet." }
    return {
      key: "review",
      title: "Review Ratings",
      status: gamesWithoutRatings === 0 ? "COMPLETE" : "READY",
      detail: `${scheduledGames} scheduled · ${gamesWithRatings} rated · ${gamesWithoutRatings} without a rating.`,
      notes: noRatingReasons.map((r) => `${r.count} × ${r.reason}`),
    }
  })()

  // 5) Publish & Lock Official Picks
  const publishPicks: StageView = (() => {
    if (gamesWithRatings === 0)
      return { key: "publish", title: "Publish & Lock Official Picks", status: "BLOCKED", detail: "Publish opens once ratings exist. Picks are frozen before kickoff; backdating is never allowed." }
    if (officialPublishedPicks === 0)
      return { key: "publish", title: "Publish & Lock Official Picks", status: "READY", detail: "Ratings are live. Publish & lock official picks before kickoff (locked picks are never overwritten)." }
    return { key: "publish", title: "Publish & Lock Official Picks", status: "COMPLETE", detail: `${officialPublishedPicks} official pick(s) locked for ${weekLabel}.` }
  })()

  // 6) Grade Finals
  const gradeFinals: StageView = (() => {
    if (officialPublishedPicks === 0)
      return { key: "grade", title: "Grade Finals", status: "BLOCKED", detail: "No official picks to grade yet." }
    return { key: "grade", title: "Grade Finals", status: "READY", detail: "Grade published picks against official finals once games complete." }
  })()

  const stages = [featureReadiness, oddsRefresh, generateRatings, reviewRatings, publishPicks, gradeFinals]

  // Operable = the owner can drive the week end-to-end from Admin right now:
  // there is a schedule, features exist for at least some games, and no stage is
  // BLOCKED for an infrastructure reason (schedule/model). Stale odds is a
  // NEEDS_ACTION the owner resolves via the Refresh button, so it does not block.
  const operable =
    scheduleAvailable &&
    scheduledGames > 0 &&
    gamesWithFeatures > 0 &&
    model != null

  return {
    season,
    week: canonicalWeek,
    seasonType: ctx.seasonType,
    weekLabel,
    model,
    metrics: {
      scheduledGames,
      gamesWithFeatures,
      gamesWithDkOdds,
      gamesWithRatings,
      gamesWithoutRatings,
      noRatingReasons,
      immutableShadowSignals,
      officialPublishedPicks,
      dkSnapshotAt,
      dkSnapshotAgeHours: dkSnapshotAgeHours == null ? null : Number(dkSnapshotAgeHours.toFixed(2)),
    },
    stages,
    operable,
  }
}
