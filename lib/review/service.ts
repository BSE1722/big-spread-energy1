import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { reviewTickets, reviewLegs } from "@/lib/db/schema"
import { getCfbdGames } from "@/lib/cfbd"
import { rawWeekForCanonical } from "@/lib/bse/week-identity"
import { gradePick, unitsForWin, type Market, type PickSide } from "@/lib/predictions/grade"
import type { RecordTicketInput, ReviewLeg, ReviewTicket } from "@/lib/review/types"
import { computeFragility } from "@/lib/review/fragility"

/* --------------------------------------------------------------------------
 * Tamper-evidence over a review leg's FROZEN pregame content. Internal
 * integrity check only (same spirit as the Official Picks lock hash).
 * ------------------------------------------------------------------------ */
function legLockHash(fields: {
  ticketNumber: number
  legIndex: number
  gameId: string | null
  homeTeam: string
  awayTeam: string
  market: string
  pickSide: string
  pickLabel: string
  lineValue: number | null
  priceAmerican: number | null
  bseRating: number | null
  analyzedAt: string
}): string {
  const canonical = [
    fields.ticketNumber,
    fields.legIndex,
    fields.gameId ?? "\u0000null",
    fields.homeTeam,
    fields.awayTeam,
    fields.market,
    fields.pickSide,
    fields.pickLabel,
    fields.lineValue ?? "\u0000null",
    fields.priceAmerican ?? "\u0000null",
    fields.bseRating ?? "\u0000null",
    fields.analyzedAt,
  ].join("|")
  return createHash("sha256").update(canonical).digest("hex")
}

function ticketLockHash(ticketNumber: number, analyzedAt: string, legHashes: string[]): string {
  return createHash("sha256").update([ticketNumber, analyzedAt, ...legHashes].join("|")).digest("hex")
}

/* --------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------ */
export type RecordResult = { ok: true; ticket: ReviewTicket } | { ok: false; error: string }

export interface ReviewGradeRunResult {
  eligibleLegs: number
  weekGroups: number
  cfbdRequests: number
  gradedLegs: number
  gradedTickets: number
  reason: string
}

interface CfbdFinal {
  id: number
  completed?: boolean
  homePoints: number | null
  awayPoints: number | null
}

function isFinal(g: CfbdFinal | undefined): g is CfbdFinal {
  if (!g) return false
  if (typeof g.completed === "boolean" && !g.completed) return false
  return g.homePoints != null && g.awayPoints != null
}

function weekKey(p: { season: number; week: number; seasonType: string }): string {
  return `${p.season}::${p.week}::${p.seasonType}`
}

/* --------------------------------------------------------------------------
 * RECORD — freeze a ticket + its legs. Pregame zone written ONCE.
 * ------------------------------------------------------------------------ */
export async function recordTicket(input: RecordTicketInput): Promise<RecordResult> {
  if (!input.legs || input.legs.length === 0) return { ok: false, error: "A ticket needs at least one leg." }

  const analyzedAtIso = input.analyzedAtIso ?? new Date().toISOString()
  const analyzedAt = new Date(analyzedAtIso)

  // Next sequential ticket number (advisory-lock-free; unique index is the real
  // guard, so a rare race just fails one insert which the caller can retry).
  const [maxRow] = await db
    .select({ n: reviewTickets.ticketNumber })
    .from(reviewTickets)
    .orderBy(desc(reviewTickets.ticketNumber))
    .limit(1)
  const ticketNumber = (maxRow?.n ?? 0) + 1

  const frag = computeFragility(input.legs)

  const ticketId = randomUUID()
  const legRows = input.legs.map((leg, legIndex) => {
    const market = leg.market ?? "spread"
    const lockHash = legLockHash({
      ticketNumber,
      legIndex,
      gameId: leg.gameId ?? null,
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      market,
      pickSide: leg.pickSide,
      pickLabel: leg.pickLabel,
      lineValue: leg.lineValue,
      priceAmerican: leg.priceAmerican,
      bseRating: leg.bseRating,
      analyzedAt: analyzedAtIso,
    })
    return {
      id: randomUUID(),
      ticketId,
      legIndex,
      gameId: leg.gameId ?? null,
      season: leg.season,
      week: leg.week,
      seasonType: leg.seasonType ?? "regular",
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      kickoff: leg.kickoffIso ? new Date(leg.kickoffIso) : null,
      market,
      pickSide: leg.pickSide,
      pickLabel: leg.pickLabel,
      lineValue: leg.lineValue,
      priceAmerican: leg.priceAmerican,
      book: leg.book ?? "draftkings",
      bseRating: leg.bseRating, // REAL or null — never fabricated
      classification: leg.classification ?? null,
      lineEdge: leg.lineEdge ?? null,
      fairLine: leg.fairLine ?? null,
      recommendation: leg.recommendation ?? null,
      confidenceRead: leg.confidenceRead ?? null,
      riskFlags: leg.riskFlags ?? [],
      altRecommendation: leg.altRecommendation ?? null,
      contextInfo: leg.contextInfo ?? null,
      analyzedAt,
      lockHash,
      status: "pending" as const,
    }
  })

  const ticketRow = {
    id: ticketId,
    ticketNumber,
    title: input.title ?? null,
    source: input.source,
    season: input.season,
    week: input.week,
    seasonType: input.seasonType ?? "regular",
    analyzedAt,
    createdBy: input.createdBy ?? null,
    notes: input.notes ?? null,
    combinedPriceAmerican: input.combinedPriceAmerican ?? null,
    legCount: legRows.length,
    fragilityTier: frag.tier,
    fragilityScore: frag.score,
    fragilityReasons: frag.reasons,
    weakestLegIndex: frag.weakestLegIndex,
    recordedLegCount: input.recorded?.legCount ?? null,
    recordedWins: input.recorded?.wins ?? null,
    recordedLosses: input.recorded?.losses ?? null,
    recordedPushes: input.recorded?.pushes ?? null,
    lockHash: ticketLockHash(ticketNumber, analyzedAtIso, legRows.map((l) => l.lockHash)),
    status: "pending" as const,
  }

  try {
    await db.insert(reviewTickets).values(ticketRow)
    await db.insert(reviewLegs).values(legRows)
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? "Failed to record ticket." }
  }

  const [ticket] = await db.select().from(reviewTickets).where(eq(reviewTickets.id, ticketId)).limit(1)
  return { ok: true, ticket }
}

/* --------------------------------------------------------------------------
 * GRADE FINALS — CFBD-conserving, reuses gradePick. Fills the graded zone of
 * still-pending legs only; never touches pregame fields. Then rolls per-leg
 * grades up into the ticket header.
 * ------------------------------------------------------------------------ */
export async function gradeReviewFinals(): Promise<ReviewGradeRunResult> {
  // 1. NEON FIRST — only pending legs that have a resolvable CFBD game id.
  const pending = await db.select().from(reviewLegs).where(eq(reviewLegs.status, "pending"))
  const gradable = pending.filter((l) => l.gameId != null)

  if (gradable.length === 0) {
    return { eligibleLegs: 0, weekGroups: 0, cfbdRequests: 0, gradedLegs: 0, gradedTickets: 0, reason: "no gradable pending legs" }
  }

  // 2. BATCH by (season, week, seasonType) — one CFBD call per group.
  const groups = new Map<string, ReviewLeg[]>()
  for (const l of gradable) {
    const key = weekKey({ season: l.season, week: l.week, seasonType: l.seasonType })
    const arr = groups.get(key) ?? []
    arr.push(l)
    groups.set(key, arr)
  }

  let cfbdRequests = 0
  let gradedLegs = 0
  const touchedTickets = new Set<string>()

  for (const [, legs] of groups) {
    const sample = legs[0]
    let games: CfbdFinal[] = []
    try {
      cfbdRequests += 1
      const raw = (await getCfbdGames({
        year: sample.season,
        week: rawWeekForCanonical(sample.week),
        seasonType: sample.seasonType as "regular" | "postseason",
      })) as CfbdFinal[]
      games = Array.isArray(raw) ? raw : []
    } catch (err) {
      console.log("[v0] gradeReviewFinals CFBD fetch failed:", (err as Error)?.message)
      continue
    }

    const byId = new Map<string, CfbdFinal>()
    for (const g of games) byId.set(`cfbd-${g.id}`, g)

    for (const leg of legs) {
      const g = byId.get(leg.gameId as string)
      if (!isFinal(g)) continue

      const homeScore = g.homePoints as number
      const awayScore = g.awayPoints as number
      const result = gradePick({
        market: leg.market as Market,
        pickSide: leg.pickSide as PickSide,
        lineValue: leg.lineValue,
        priceAmerican: leg.priceAmerican,
        homeScore,
        awayScore,
      })

      const derived = deriveLegDetail(leg, homeScore, awayScore, result.grade)

      const updated = await db
        .update(reviewLegs)
        .set({
          status: "graded",
          homeScore,
          awayScore,
          grade: result.grade,
          unitsDelta: result.unitsDelta,
          favoriteWonOutright: derived.favoriteWonOutright,
          actualMargin: derived.actualMargin,
          requiredMargin: derived.requiredMargin,
          marginVsSpread: derived.marginVsSpread,
          altWouldHaveWon: derived.altWouldHaveWon,
          altProtectionOutcome: derived.altProtectionOutcome,
          gradedAt: new Date(),
          gradedSource: "cfbd",
          updatedAt: new Date(),
        })
        .where(and(eq(reviewLegs.id, leg.id), eq(reviewLegs.status, "pending")))
        .returning({ id: reviewLegs.id })

      if (updated.length > 0) {
        gradedLegs += 1
        touchedTickets.add(leg.ticketId)
      }
    }
  }

  // 3. Roll up any ticket whose legs are now all graded.
  let gradedTickets = 0
  const affected = new Set<string>(touchedTickets)
  for (const ticketId of affected) {
    if (await rollUpTicket(ticketId)) gradedTickets += 1
  }

  return {
    eligibleLegs: gradable.length,
    weekGroups: groups.size,
    cfbdRequests,
    gradedLegs,
    gradedTickets,
    reason: `graded ${gradedLegs}/${gradable.length} legs across ${groups.size} week group(s); ${gradedTickets} ticket(s) completed`,
  }
}

/** Derive the per-leg graded detail fields (spread-focused; safe for all markets). */
function deriveLegDetail(
  leg: ReviewLeg,
  homeScore: number,
  awayScore: number,
  grade: "win" | "loss" | "push",
): {
  favoriteWonOutright: boolean | null
  actualMargin: number | null
  requiredMargin: number | null
  marginVsSpread: number | null
  altWouldHaveWon: boolean | null
  altProtectionOutcome: ReviewLeg["altProtectionOutcome"]
} {
  const isSpread = leg.market === "spread"
  const pickIsHome = leg.pickSide === "home"
  const favoriteWonOutright =
    leg.market === "moneyline" || homeScore === awayScore
      ? homeScore === awayScore
        ? false
        : null
      : null

  if (!isSpread || leg.lineValue == null) {
    return {
      favoriteWonOutright: homeScore === awayScore ? false : null,
      actualMargin: null,
      requiredMargin: null,
      marginVsSpread: null,
      altWouldHaveWon: null,
      altProtectionOutcome: "na",
    }
  }

  const pickTeamMargin = pickIsHome ? homeScore - awayScore : awayScore - homeScore
  const actualMargin = pickTeamMargin
  const requiredMargin = -leg.lineValue // pick covers when actualMargin > requiredMargin
  const marginVsSpread = pickTeamMargin + leg.lineValue // >0 cover, 0 push, <0 miss

  // Did the picked side win the game outright (favorite-won relative to pick)?
  const pickWonOutright = pickTeamMargin > 0

  // Alt-line protection: if a worthwhile alt spread was recorded, would that
  // alternate number have covered given the real result?
  const alt = leg.altRecommendation as { pickedSpread?: number | null; worthwhile?: boolean | null } | null
  let altWouldHaveWon: boolean | null = null
  let altProtectionOutcome: ReviewLeg["altProtectionOutcome"] = "na"
  if (alt && alt.pickedSpread != null) {
    const altMargin = pickTeamMargin + alt.pickedSpread
    altWouldHaveWon = altMargin > 0
    if (grade === "loss") {
      altProtectionOutcome = altWouldHaveWon ? "saved" : pickWonOutright ? "still_lost" : "favorite_lost_no_protection"
    } else if (grade === "win") {
      altProtectionOutcome = "improved_not_needed"
    } else {
      altProtectionOutcome = "na"
    }
  } else if (grade === "loss") {
    altProtectionOutcome = pickWonOutright ? "still_lost" : "favorite_lost_no_protection"
  }

  return {
    favoriteWonOutright: pickWonOutright,
    actualMargin,
    requiredMargin,
    marginVsSpread,
    altWouldHaveWon,
    altProtectionOutcome,
  }
}

/** If every leg of a ticket is graded, freeze the ticket header. Idempotent. */
async function rollUpTicket(ticketId: string): Promise<boolean> {
  const legs = await db.select().from(reviewLegs).where(eq(reviewLegs.ticketId, ticketId))
  if (legs.length === 0) return false
  const allGraded = legs.every((l) => l.status === "graded")
  if (!allGraded) return false

  let won = 0
  let lost = 0
  let pushed = 0
  for (const l of legs) {
    if (l.grade === "win") won += 1
    else if (l.grade === "loss") lost += 1
    else if (l.grade === "push") pushed += 1
  }
  const decided = won + lost
  const overallGrade = lost === 0 && won > 0 ? "win" : "loss" // a parlay needs every leg

  const updated = await db
    .update(reviewTickets)
    .set({
      status: "graded",
      overallGrade,
      legsWon: won,
      legsLost: lost,
      legsPushed: pushed,
      individualWinRate: decided > 0 ? won / decided : null,
      gradedAt: new Date(),
      gradedSource: "cfbd",
      updatedAt: new Date(),
    })
    .where(and(eq(reviewTickets.id, ticketId), eq(reviewTickets.status, "pending")))
    .returning({ id: reviewTickets.id })

  return updated.length > 0
}

/* --------------------------------------------------------------------------
 * READS
 * ------------------------------------------------------------------------ */
export async function listTickets(): Promise<ReviewTicket[]> {
  return db.select().from(reviewTickets).orderBy(desc(reviewTickets.ticketNumber))
}

export async function getTicketWithLegs(
  ticketNumber: number,
): Promise<{ ticket: ReviewTicket; legs: ReviewLeg[] } | null> {
  const [ticket] = await db.select().from(reviewTickets).where(eq(reviewTickets.ticketNumber, ticketNumber)).limit(1)
  if (!ticket) return null
  const legs = await db
    .select()
    .from(reviewLegs)
    .where(eq(reviewLegs.ticketId, ticket.id))
    .orderBy(asc(reviewLegs.legIndex))
  return { ticket, legs }
}

export async function getTicketsWithLegs(ticketIds: string[]): Promise<Map<string, ReviewLeg[]>> {
  const map = new Map<string, ReviewLeg[]>()
  if (ticketIds.length === 0) return map
  const legs = await db.select().from(reviewLegs).where(inArray(reviewLegs.ticketId, ticketIds))
  for (const l of legs) {
    const arr = map.get(l.ticketId) ?? []
    arr.push(l)
    map.set(l.ticketId, arr)
  }
  return map
}
