import "server-only"

import { randomUUID } from "node:crypto"
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm"
import { db } from "@/lib/db"
import { predictions, predictionCorrections, gradingRuns } from "@/lib/db/schema"
import { loadSnapshot } from "@/lib/odds-snapshot"
import { getCfbdGames } from "@/lib/cfbd"
import { computeLockHash, type LockableFields } from "@/lib/predictions/lock"
import { gradePick, type Grade, type Market, type PickSide } from "@/lib/predictions/grade"

/* --------------------------------------------------------------------------
 * Constants — grading conservation knobs (see plan).
 * ------------------------------------------------------------------------ */

/** A game can't be final until at least this long after kickoff. */
export const COMPLETION_BUFFER_MS = 5 * 60 * 60 * 1000 // ~5 hours
/** Cron stops auto-polling picks whose kickoff is older than this. */
export const STALE_CUTOFF_MS = 7 * 24 * 60 * 60 * 1000 // ~7 days

export const CURRENT_MODEL_VERSION = "manual-pre-model"

/* --------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------ */

export type Prediction = typeof predictions.$inferSelect
export type PredictionCorrection = typeof predictionCorrections.$inferSelect
export type GradingRun = typeof gradingRuns.$inferSelect

export interface PublishInput {
  gameId: string
  market: Market
  pickSide: PickSide
  publishedBy?: string | null
}

export type PublishResult =
  | { ok: true; prediction: Prediction }
  | { ok: false; error: string }

/* --------------------------------------------------------------------------
 * Formatting helpers
 * ------------------------------------------------------------------------ */

function fmtSigned(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

/* --------------------------------------------------------------------------
 * Publish — freezes an Official BSE Pick from the SERVER-SIDE snapshot.
 *
 * The client only sends identifiers (gameId, market, pickSide). Every frozen
 * value (line, price, book, teams, kickoff) is read from the durable odds
 * snapshot on the server, so the client can never influence the recorded line
 * or price. The lock hash is computed here and never accepted from the client.
 * ------------------------------------------------------------------------ */

export async function publishPick(input: PublishInput): Promise<PublishResult> {
  const { gameId, market, pickSide } = input

  // Validate market/side pairing up front.
  const validSides: Record<Market, PickSide[]> = {
    spread: ["home", "away"],
    total: ["over", "under"],
    moneyline: ["home", "away"],
  }
  if (!validSides[market]?.includes(pickSide)) {
    return { ok: false, error: `Invalid side "${pickSide}" for ${market} market.` }
  }

  const snapshot = await loadSnapshot()
  if (!snapshot) {
    return { ok: false, error: "No odds snapshot available. Refresh the board first." }
  }

  const game = snapshot.games.find((g) => g.cfbdId === gameId)
  if (!game) {
    return { ok: false, error: "Game not found in the current snapshot." }
  }
  if (game.oddsStatus !== "matched" || !game.market.available) {
    return { ok: false, error: "This game has no confirmed market line to freeze." }
  }

  // Kickoff only CLOSES the market to new official picks. Freezing itself
  // happens now, before kickoff.
  const kickoffMs = Date.parse(game.kickoff)
  if (Number.isFinite(kickoffMs) && Date.now() >= kickoffMs) {
    return { ok: false, error: "Kickoff has passed — no new official pick can be published for this game." }
  }

  // Derive the frozen REAL market values for the chosen market + side.
  const m = game.market
  let lineValue: number | null = null
  let priceAmerican: number | null = null
  let pickLabel = ""

  if (market === "spread") {
    const line = pickSide === "home" ? m.spread.home : m.spread.away
    const price = pickSide === "home" ? m.spread.homePrice : m.spread.awayPrice
    if (line == null) return { ok: false, error: "Spread line unavailable for that side." }
    lineValue = line
    priceAmerican = price ?? null
    const team = pickSide === "home" ? game.home.name : game.away.name
    pickLabel = `${team} ${fmtSigned(line)}`
  } else if (market === "total") {
    const points = m.total.points
    if (points == null || !m.total.withinPlausibleRange) {
      return { ok: false, error: "Total line unavailable or flagged out of range." }
    }
    lineValue = points
    priceAmerican = (pickSide === "over" ? m.total.overPrice : m.total.underPrice) ?? null
    pickLabel = `${pickSide === "over" ? "Over" : "Under"} ${points}`
  } else {
    // moneyline
    const price = pickSide === "home" ? m.moneyline.home : m.moneyline.away
    if (price == null) return { ok: false, error: "Moneyline price unavailable for that side." }
    lineValue = null
    priceAmerican = price
    const team = pickSide === "home" ? game.home.name : game.away.name
    pickLabel = `${team} ML`
  }

  // Duplicate protection: one official pick per (gameId, market).
  const existing = await db
    .select({ id: predictions.id })
    .from(predictions)
    .where(and(eq(predictions.gameId, gameId), eq(predictions.market, market)))
    .limit(1)
  if (existing.length > 0) {
    return { ok: false, error: `An official ${market} pick already exists for this game.` }
  }

  const now = new Date()
  const publishedAtIso = now.toISOString()
  const kickoffIso = new Date(kickoffMs).toISOString()
  const seasonType = snapshot.seasonType ?? "regular"

  // Model fields: REAL value or null. Never fabricated. Placeholder model means
  // we intentionally store nulls + modelIsPlaceholder=true + manual version.
  const bseRating = null
  const fairLine = null
  const edgeValue = null
  const winProb = null
  const modelIsPlaceholder = true
  const modelVersion = CURRENT_MODEL_VERSION

  const lockable: LockableFields = {
    gameId,
    season: game.season,
    week: game.week,
    seasonType,
    homeTeam: game.home.name,
    awayTeam: game.away.name,
    kickoff: kickoffIso,
    publishedAt: publishedAtIso,
    market,
    pickSide,
    pickLabel,
    lineValue,
    priceAmerican,
    book: m.bookmaker,
    bseRating,
    fairLine,
    edgeValue,
    winProb,
    modelVersion,
  }
  const lockHash = computeLockHash(lockable)

  try {
    const inserted = await db
      .insert(predictions)
      .values({
        id: randomUUID(),
        gameId,
        season: game.season,
        week: game.week,
        seasonType,
        homeTeam: game.home.name,
        awayTeam: game.away.name,
        publishedAt: now,
        kickoff: new Date(kickoffMs),
        market,
        pickSide,
        pickLabel,
        lineValue,
        priceAmerican,
        book: m.bookmaker,
        marketSnapshotAt: snapshot.snapshotAt ? new Date(snapshot.snapshotAt) : null,
        bseRating,
        fairLine,
        edgeValue,
        winProb,
        modelIsPlaceholder,
        modelVersion,
        lockHash,
        publishedBy: input.publishedBy ?? null,
        status: "locked",
      })
      .returning()
    return { ok: true, prediction: inserted[0] }
  } catch (err) {
    // Unique violation is the most likely error (race with another publish).
    const msg = (err as Error)?.message ?? "unknown error"
    if (/unique/i.test(msg)) {
      return { ok: false, error: `An official ${market} pick already exists for this game.` }
    }
    console.log("[v0] publishPick insert failed:", msg)
    return { ok: false, error: "Failed to publish pick. Please try again." }
  }
}

/* --------------------------------------------------------------------------
 * Corrections — append-only. Original values are never overwritten.
 * ------------------------------------------------------------------------ */

export interface CorrectionInput {
  predictionId: string
  field: string
  originalValue: string | null
  correctedValue: string | null
  reason: string
  adminUserId?: string | null
}

export async function addCorrection(
  input: CorrectionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.reason?.trim()) return { ok: false, error: "A correction reason is required." }

  const rows = await db
    .select({ id: predictions.id })
    .from(predictions)
    .where(eq(predictions.id, input.predictionId))
    .limit(1)
  if (rows.length === 0) return { ok: false, error: "Prediction not found." }

  await db.insert(predictionCorrections).values({
    id: randomUUID(),
    predictionId: input.predictionId,
    field: input.field,
    originalValue: input.originalValue ?? null,
    correctedValue: input.correctedValue ?? null,
    reason: input.reason.trim(),
    adminUserId: input.adminUserId ?? null,
  })

  // Flag the prediction as corrected (public page shows this). We NEVER touch
  // the original frozen values or the grade.
  await db
    .update(predictions)
    .set({ hasCorrection: true, updatedAt: new Date() })
    .where(eq(predictions.id, input.predictionId))

  return { ok: true }
}

/* --------------------------------------------------------------------------
 * Listing + performance summary (used by public /performance and admin).
 * ------------------------------------------------------------------------ */

export async function listPredictions(): Promise<Prediction[]> {
  return db.select().from(predictions).orderBy(desc(predictions.publishedAt))
}

export async function listCorrections(predictionIds: string[]): Promise<PredictionCorrection[]> {
  if (predictionIds.length === 0) return []
  return db
    .select()
    .from(predictionCorrections)
    .where(inArray(predictionCorrections.predictionId, predictionIds))
    .orderBy(desc(predictionCorrections.createdAt))
}

export interface PerformanceSummary {
  record: { wins: number; losses: number; pushes: number }
  totalGraded: number
  pending: number
  winRatePct: number | null
  unitsDelta: number
  /** Overall ROI = total units / all graded official bets * 100. */
  overallRoiPct: number | null
  /** Spread-only (ATS) subset — never conflated with overall. */
  ats: {
    wins: number
    losses: number
    pushes: number
    unitsDelta: number
    roiPct: number | null
  }
  /** Cumulative units over graded picks in chronological order (for the chart). */
  cumulative: Array<{ date: string; units: number }>
}

export function summarize(rows: Prediction[]): PerformanceSummary {
  const graded = rows.filter((r) => r.status === "graded" && r.grade)
  const pending = rows.length - graded.length

  const count = (list: Prediction[], g: Grade) => list.filter((r) => r.grade === g).length
  const sumUnits = (list: Prediction[]) => list.reduce((acc, r) => acc + (r.unitsDelta ?? 0), 0)

  const wins = count(graded, "win")
  const losses = count(graded, "loss")
  const pushes = count(graded, "push")
  const totalGraded = graded.length
  const unitsDelta = round2(sumUnits(graded))
  const winRatePct = wins + losses > 0 ? round1((wins / (wins + losses)) * 100) : null
  // "All graded official bets" is the denominator, per spec.
  const overallRoiPct = totalGraded > 0 ? round1((unitsDelta / totalGraded) * 100) : null

  const spread = graded.filter((r) => r.market === "spread")
  const atsWins = count(spread, "win")
  const atsLosses = count(spread, "loss")
  const atsPushes = count(spread, "push")
  const atsUnits = round2(sumUnits(spread))
  const atsRoiPct = spread.length > 0 ? round1((atsUnits / spread.length) * 100) : null

  // Cumulative series ordered by when the game was graded/kicked off.
  const chron = [...graded].sort((a, b) => {
    const ta = (a.gradedAt ?? a.kickoff)?.getTime?.() ?? 0
    const tb = (b.gradedAt ?? b.kickoff)?.getTime?.() ?? 0
    return ta - tb
  })
  let running = 0
  const cumulative = chron.map((r) => {
    running = round2(running + (r.unitsDelta ?? 0))
    const d = r.gradedAt ?? r.kickoff
    return { date: d ? new Date(d).toISOString() : "", units: running }
  })

  return {
    record: { wins, losses, pushes },
    totalGraded,
    pending,
    winRatePct,
    unitsDelta,
    overallRoiPct,
    ats: { wins: atsWins, losses: atsLosses, pushes: atsPushes, unitsDelta: atsUnits, roiPct: atsRoiPct },
    cumulative,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/* --------------------------------------------------------------------------
 * Grading engine — the API-conserving core (cron AND manual button).
 *
 * See the plan's API-CONSERVATION RULES. Sequence: Neon first → zero-call exit
 * when nothing is eligible → batch one CFBD call per (season,week,seasonType)
 * group → match locally by game id → grade only truly-final games → never
 * recheck graded picks → log the run.
 * ------------------------------------------------------------------------ */

interface CfbdFinal {
  id: number
  completed?: boolean
  status?: string
  homePoints: number | null
  awayPoints: number | null
}

export interface GradeRunResult {
  trigger: "cron" | "manual"
  eligibleCount: number
  weekGroups: number
  cfbdRequests: number
  gradedCount: number
  reason: string
}

function weekKey(p: { season: number; week: number; seasonType: string }): string {
  return `${p.season}::${p.week}::${p.seasonType}`
}

/** A CFBD game looks final only when completed or both scores are present. */
function isFinal(g: CfbdFinal | undefined): g is CfbdFinal {
  if (!g) return false
  if (typeof g.completed === "boolean" && !g.completed) return false
  return g.homePoints != null && g.awayPoints != null
}

export async function gradePending(trigger: "cron" | "manual"): Promise<GradeRunResult> {
  const runId = randomUUID()
  const startedAt = new Date()
  await db.insert(gradingRuns).values({ id: runId, trigger, startedAt })

  const now = Date.now()
  const bufferCutoff = new Date(now - COMPLETION_BUFFER_MS) // kickoff <= this

  // 1. NEON FIRST. Base eligibility: locked + past kickoff + completion buffer.
  //    Cron ALSO enforces the stale cutoff; manual intentionally does not, so
  //    an admin can resolve a genuinely-final-but-stale pick on demand.
  const conditions = [eq(predictions.status, "locked"), lte(predictions.kickoff, bufferCutoff)]
  if (trigger === "cron") {
    conditions.push(gte(predictions.kickoff, new Date(now - STALE_CUTOFF_MS)))
  }
  const eligible = await db
    .select()
    .from(predictions)
    .where(and(...conditions))

  // 2. ZERO-CALL EXIT. Nothing to grade → make no CFBD calls at all.
  if (eligible.length === 0) {
    const reason = "no eligible picks"
    await finishRun(runId, { eligibleCount: 0, weekGroups: 0, cfbdRequests: 0, gradedCount: 0, reason })
    return { trigger, eligibleCount: 0, weekGroups: 0, cfbdRequests: 0, gradedCount: 0, reason }
  }

  // 3. BATCH BY WEEK GROUP — one CFBD call per distinct (season,week,seasonType).
  const groups = new Map<string, Prediction[]>()
  for (const p of eligible) {
    const key = weekKey(p)
    const arr = groups.get(key) ?? []
    arr.push(p)
    groups.set(key, arr)
  }

  let cfbdRequests = 0
  let gradedCount = 0
  let notFinal = 0

  for (const [, picks] of groups) {
    const sample = picks[0]
    let games: CfbdFinal[] = []
    try {
      cfbdRequests += 1
      const raw = (await getCfbdGames({
        year: sample.season,
        week: sample.week,
        seasonType: sample.seasonType as "regular" | "postseason",
      })) as CfbdFinal[]
      games = Array.isArray(raw) ? raw : []
    } catch (err) {
      console.log("[v0] gradePending CFBD fetch failed:", (err as Error)?.message)
      continue // leave this group's picks pending; other groups still processed
    }

    // 4. MATCH LOCALLY by CFBD game id (`cfbd-<id>`).
    const byId = new Map<string, CfbdFinal>()
    for (const g of games) byId.set(`cfbd-${g.id}`, g)

    for (const p of picks) {
      const g = byId.get(p.gameId)
      // 5. GRADE ONLY TRULY-FINAL GAMES. Otherwise stays PENDING.
      if (!isFinal(g)) {
        notFinal += 1
        continue
      }
      const result = gradePick({
        market: p.market as Market,
        pickSide: p.pickSide as PickSide,
        lineValue: p.lineValue,
        priceAmerican: p.priceAmerican,
        homeScore: g.homePoints as number,
        awayScore: g.awayPoints as number,
      })
      // 6. NEVER RECHECK GRADED PICKS — update only if still locked (idempotent).
      const updated = await db
        .update(predictions)
        .set({
          status: "graded",
          homeScore: g.homePoints,
          awayScore: g.awayPoints,
          grade: result.grade,
          unitsDelta: result.unitsDelta,
          gradedAt: new Date(),
          gradedSource: "cfbd",
          updatedAt: new Date(),
        })
        .where(and(eq(predictions.id, p.id), eq(predictions.status, "locked")))
        .returning({ id: predictions.id })
      if (updated.length > 0) gradedCount += 1
    }
  }

  const reason = `graded ${gradedCount} of ${eligible.length} eligible; ${notFinal} not final; ${groups.size} week group(s), ${cfbdRequests} CFBD request(s)`
  await finishRun(runId, {
    eligibleCount: eligible.length,
    weekGroups: groups.size,
    cfbdRequests,
    gradedCount,
    reason,
  })
  return { trigger, eligibleCount: eligible.length, weekGroups: groups.size, cfbdRequests, gradedCount, reason }
}

async function finishRun(
  runId: string,
  data: { eligibleCount: number; weekGroups: number; cfbdRequests: number; gradedCount: number; reason: string; error?: string },
): Promise<void> {
  await db
    .update(gradingRuns)
    .set({
      finishedAt: new Date(),
      eligibleCount: data.eligibleCount,
      weekGroups: data.weekGroups,
      cfbdRequests: data.cfbdRequests,
      gradedCount: data.gradedCount,
      reason: data.reason,
      error: data.error ?? null,
    })
    .where(eq(gradingRuns.id, runId))
}

export async function listGradingRuns(limit = 10): Promise<GradingRun[]> {
  return db.select().from(gradingRuns).orderBy(desc(gradingRuns.startedAt)).limit(limit)
}
