"use server"

import { revalidatePath } from "next/cache"
import { getAccessState } from "@/lib/access"
import { getCurrentContext } from "@/lib/bse/season"
import { getAdmin } from "@/lib/admin-auth"
import { getLiveBoard } from "@/lib/board-feed"
import { recordTicket } from "@/lib/review/service"
import type { RecordLegInput } from "@/lib/review/types"
import {
  evaluateBet,
  summarizeParlay,
  combineAmericanPrices,
  CLASSIFICATION_COPY,
  legTreatment,
  ticketDisposition,
  TREATMENT_COPY,
  DISPOSITION_COPY,
  type BetSide,
  type BetClassification,
} from "@/lib/bse/price-aware"
import { generateAllTickets } from "@/lib/parlay/generate"
import {
  getToolUsage,
  recordUse,
  findUseByHash,
  getLastPayload,
  toolRequestHash,
} from "@/lib/usage/service"
import { setToolLimits, type ToolLimits } from "@/lib/config/service"
import type {
  AnalyzerLegInput,
  AnalyzerLegResult,
  AnalyzerResult,
  AnalyzerSwap,
  AnalyzerSwapCandidate,
  RunAnalyzerResult,
  GenerateParlaidResult,
} from "@/lib/tools/types"

/* -------------------------------- helpers --------------------------------- */

function fmtSpread(n: number | null): string {
  if (n == null) return "—"
  if (n === 0) return "PK"
  return n > 0 ? `+${n}` : `${n}`
}

function mainPriceFor(game: { marketSpreadPrice?: { home: number | null; away: number | null } }, side: BetSide): number | null {
  const p = game.marketSpreadPrice
  if (!p) return null
  return side === "home" ? p.home : p.away
}

function pickedSpreadFor(homeSpread: number | null, side: BetSide): number | null {
  if (homeSpread == null) return null
  return side === "home" ? homeSpread : -homeSpread
}

const CLASS_RANK: Record<BetClassification, number> = {
  STRONG_LINE_PRICE_OK: 3,
  GOOD_LINE_EXPENSIVE: 2,
  NO_EDGE: 1,
  INSUFFICIENT_DATA: 0,
}

/** Minimal board-game shape the swap search reads (all real model outputs). */
type SwapBoardGame = {
  id: string
  home: { name: string; abbr: string }
  away: { name: string; abbr: string }
  fairSpread: number | null
  marketSpread: number | null
  marketSpreadPrice?: { home: number | null; away: number | null }
  bseRating: number | null
  pick: string | null
}

/**
 * For every analyzed leg BSE does NOT already KEEP, find the single best board
 * pick to replace it with. A candidate must: be a different game not already on
 * the ticket, carry a real BSE lean (`pick`), grade STRONG_LINE_PRICE_OK through
 * the SAME evaluateBet on its live main line, and outrank the leg it replaces on
 * canonical bseRating. Ranked by rating then line edge. Nothing is fabricated —
 * when no board pick qualifies, the candidate is null ("no validated upgrade").
 */
function findSwaps(
  legs: AnalyzerLegResult[],
  boardGames: SwapBoardGame[],
  excludeGameIds: Set<string>,
): AnalyzerSwap[] {
  const needsHelp = legs.filter((l) => l.treatment !== "KEEP")
  if (needsHelp.length === 0) return []

  const usedCandidateIds = new Set<string>()
  const swaps: AnalyzerSwap[] = []

  for (const leg of needsHelp) {
    let best: { cand: AnalyzerSwapCandidate; rating: number; edge: number } | null = null

    for (const g of boardGames) {
      if (excludeGameIds.has(g.id) || usedCandidateIds.has(g.id)) continue
      if (!g.pick || g.fairSpread == null || g.marketSpread == null || g.bseRating == null) continue

      const side: BetSide = g.pick === g.home.name ? "home" : "away"
      const price = mainPriceFor(g, side)
      const ev = evaluateBet({ fairHomeSpread: g.fairSpread, offeredHomeSpread: g.marketSpread, price, side })
      if (ev.classification !== "STRONG_LINE_PRICE_OK") continue

      // Must beat the leg it replaces. Unverified legs (no rating) accept any
      // rated STRONG candidate; rated legs require a strictly higher rating.
      if (leg.bseRating != null && g.bseRating <= leg.bseRating) continue

      const rating = g.bseRating
      const edge = ev.lineEdge ?? Number.NEGATIVE_INFINITY
      if (!best || rating > best.rating || (rating === best.rating && edge > best.edge)) {
        const pickedTeamName = side === "home" ? g.home.name : g.away.name
        best = {
          rating,
          edge,
          cand: {
            gameId: g.id,
            matchup: `${g.away.name} @ ${g.home.name}`,
            pickLabel: `${pickedTeamName} ${fmtSpread(ev.pickedSpread)}`,
            bseRating: g.bseRating,
            pickedSpread: ev.pickedSpread,
            fairPicked: pickedSpreadFor(g.fairSpread, side),
            lineEdge: ev.lineEdge,
            priceTier: ev.priceTier,
            impliedBreakeven: ev.impliedBreakeven,
          },
        }
      }
    }

    if (best) usedCandidateIds.add(best.cand.gameId)
    swaps.push({
      legGameId: leg.gameId,
      legLabel: leg.pickLabel,
      legTreatment: leg.treatment,
      candidate: best?.cand ?? null,
    })
  }

  return swaps
}

/**
 * Plain-English ticket read assembled ONLY from the disposition + real leg
 * labels/counts already in the result, so it can never contradict the cards.
 */
function buildTicketNarrative(
  disposition: ReturnType<typeof ticketDisposition>,
  summary: ReturnType<typeof summarizeParlay>,
  legs: AnalyzerLegResult[],
): string {
  const keeps = legs.filter((l) => l.treatment === "KEEP")
  const cautions = legs.filter((l) => l.treatment === "CAUTION")
  const cuts = legs.filter((l) => l.treatment === "CUT")
  const unverified = legs.filter((l) => l.treatment === "UNVERIFIED")

  const parts: string[] = [DISPOSITION_COPY[disposition].blurb]

  if (summary.legCount > 0) {
    const tally = `${keeps.length} keep, ${cautions.length} caution, ${cuts.length} cut, ${unverified.length} unverified`
    parts.push(`Across ${summary.legCount} leg${summary.legCount === 1 ? "" : "s"}: ${tally}.`)
  }
  if (keeps.length > 0) {
    const bestKeep = [...keeps].sort((a, b) => (b.bseRating ?? 0) - (a.bseRating ?? 0))[0]
    parts.push(
      `Strongest leg BSE backs is ${bestKeep.pickLabel}${
        bestKeep.bseRating != null ? ` (rating ${Math.round(bestKeep.bseRating)})` : ""
      }.`,
    )
  }
  if (cuts.length > 0) parts.push(`${TREATMENT_COPY.CUT.label}: ${cuts.map((l) => l.pickLabel).join(", ")}.`)
  if (cautions.length > 0) parts.push(`${TREATMENT_COPY.CAUTION.label}: ${cautions.map((l) => l.pickLabel).join(", ")}.`)
  if (unverified.length > 0)
    parts.push(`${TREATMENT_COPY.UNVERIFIED.label}: ${unverified.map((l) => l.pickLabel).join(", ")} — treat as blind.`)

  return parts.join(" ")
}

/**
 * Resolve the current viewer + week context and the gate decision shared by
 * both tools. Guests never reach compute; free (Rookie) users are limited;
 * Pro is uncapped. All read server-side — the client can never spoof tier.
 */
async function resolveGate(tool: "analyzer" | "parlaid") {
  const access = await getAccessState()
  const ctx = getCurrentContext()

  if (access.tier === "guest" || !access.userId) {
    return { ok: false as const, gate: { status: "auth" as const } }
  }

  const isPro = access.tier === "pro"
  const usage = await getToolUsage(access.userId, ctx.season, ctx.week, ctx.seasonType, isPro)
  const info = tool === "analyzer" ? usage.analyzer : usage.parlaid

  if (!isPro && info.remaining <= 0) {
    const lastTicket = await getLastPayload(access.userId, tool)
    return { ok: false as const, gate: { status: "locked" as const, usage, lastTicket } }
  }

  return {
    ok: true as const,
    userId: access.userId,
    isPro,
    season: ctx.season,
    week: ctx.week,
    seasonType: ctx.seasonType,
  }
}

/* ------------------------------- runAnalyzer ------------------------------- */

export async function runAnalyzer(legs: AnalyzerLegInput[]): Promise<RunAnalyzerResult> {
  if (!Array.isArray(legs) || legs.length === 0) {
    return { status: "error", error: "Add at least one leg before analyzing." }
  }

  const gate = await resolveGate("analyzer")
  if (!gate.ok) return gate.gate

  const board = await getLiveBoard()
  if (!board.ok) return { status: "error", error: board.error, retryable: board.retryable }
  if (!board.projectionsAvailable) {
    return { status: "error", error: "This week's BSE reads haven't published yet, so there's nothing to grade." }
  }

  const gamesById = new Map(board.games.map((g) => [g.id, g]))

  const resultLegs: AnalyzerLegResult[] = []
  const recordLegs: RecordLegInput[] = []

  for (const leg of legs) {
    const game = gamesById.get(leg.gameId)
    if (!game) continue // unresolved games can't be graded or snapshotted
    const side: BetSide = leg.side === "away" ? "away" : "home"
    const offeredHomeSpread = leg.altHomeSpread ?? game.marketSpread
    const price = leg.altPrice ?? mainPriceFor(game, side)
    const ev = evaluateBet({ fairHomeSpread: game.fairSpread, offeredHomeSpread, price, side })
    const usingAlt = leg.altHomeSpread != null || leg.altPrice != null
    const pickedTeamName = side === "home" ? game.home.name : game.away.name
    const pickLabel = `${pickedTeamName} ${fmtSpread(ev.pickedSpread)}`

    resultLegs.push({
      gameId: game.id,
      matchup: `${game.away.name} @ ${game.home.name}`,
      kickoffIso: game.kickoffTBD ? null : game.kickoff,
      pickSide: side,
      pickedTeamName,
      pickLabel,
      pickedSpread: ev.pickedSpread,
      price: ev.price,
      fairPicked: pickedSpreadFor(game.fairSpread, side),
      lineEdge: ev.lineEdge,
      classification: ev.classification,
      treatment: legTreatment(ev.classification), // pure relabel of classification
      priceTier: ev.priceTier,
      impliedBreakeven: ev.impliedBreakeven,
      bseRating: game.bseRating, // canonical board rating (same loader recordTicket captures)
      usingAlt,
    })

    recordLegs.push({
      gameId: game.id,
      season: game.season,
      week: game.week,
      seasonType: board.seasonType,
      homeTeam: game.home.name,
      awayTeam: game.away.name,
      kickoffIso: game.kickoffTBD ? null : game.kickoff,
      market: "spread",
      pickSide: side,
      pickLabel,
      lineValue: ev.pickedSpread,
      priceAmerican: ev.price,
      classification: ev.classification,
      lineEdge: ev.lineEdge,
      fairLine: game.fairSpread,
      // bseRating intentionally omitted — recordTicket captures the canonical value.
      altRecommendation: usingAlt
        ? { pickedSpread: ev.pickedSpread, price: ev.price, verdict: ev.classification, worthwhile: null }
        : null,
    })
  }

  if (resultLegs.length === 0) {
    return { status: "error", error: "None of these games are on the current board anymore." }
  }

  const summary = summarizeParlay(resultLegs.map((l) => ({ classification: l.classification, lineEdge: l.lineEdge })))
  const combined = combineAmericanPrices(resultLegs.map((l) => l.price))

  // Weakest / strongest leg (real classification + edge, no EV/win-prob).
  let weakestLabel: string | null = null
  let strongestLabel: string | null = null
  if (resultLegs.length >= 2) {
    const byWorst = [...resultLegs].sort(
      (a, b) => CLASS_RANK[a.classification] - CLASS_RANK[b.classification] || (a.lineEdge ?? 0) - (b.lineEdge ?? 0),
    )
    const byBest = [...resultLegs].sort(
      (a, b) => CLASS_RANK[b.classification] - CLASS_RANK[a.classification] || (b.lineEdge ?? 0) - (a.lineEdge ?? 0),
    )
    weakestLabel = `${byWorst[0].pickLabel} — ${CLASSIFICATION_COPY[byWorst[0].classification].label}`
    strongestLabel = `${byBest[0].pickLabel} — ${CLASSIFICATION_COPY[byBest[0].classification].label}`
  }

  // Whole-ticket call — deterministic over the summary counts only.
  const disposition = ticketDisposition(summary)

  // Upgrade search: for every leg BSE doesn't already KEEP, look for a board
  // pick that grades STRONG at a higher canonical rating. Uses the SAME
  // evaluateBet + real board fields; never fabricates a candidate.
  const swaps = findSwaps(resultLegs, board.games, new Set(resultLegs.map((l) => l.gameId)))

  // Narrative — assembled purely from counts + real leg labels, so it can never
  // contradict the cards above it.
  const narrative = buildTicketNarrative(disposition, summary, resultLegs)

  const result: AnalyzerResult = {
    legs: resultLegs,
    combinedAmerican: combined?.american ?? null,
    summary,
    disposition,
    narrative,
    swaps,
    weakestLabel,
    strongestLabel,
    analyzedAtIso: new Date().toISOString(),
  }

  // Idempotency signature: normalized, order-independent leg selection.
  const signature = legs
    .map((l) => `${l.gameId}:${l.side}:${l.altHomeSpread ?? "m"}:${l.altPrice ?? "m"}`)
    .sort()
    .join("|")
  const requestHash = toolRequestHash({
    userId: gate.userId,
    tool: "analyzer",
    season: gate.season,
    week: gate.week,
    seasonType: gate.seasonType,
    signature,
  })

  // Re-press / refresh of the SAME ticket: replay the stored result, no new
  // snapshot and no new allowance consumed.
  const existing = await findUseByHash(gate.userId, "analyzer", requestHash)
  if (existing) {
    const usage = await getToolUsage(gate.userId, gate.season, gate.week, gate.seasonType, gate.isPro)
    const replayResult = (existing.payload as AnalyzerResult | null) ?? result
    return { status: "ok", result: replayResult, ticketId: existing.ticketId, ticketNumber: null, usage, replayed: true }
  }

  const rec = await recordTicket({
    source: "analyzer",
    userId: gate.userId,
    season: gate.season,
    week: gate.week,
    seasonType: gate.seasonType,
    combinedPriceAmerican: result.combinedAmerican,
    legs: recordLegs,
  })

  const ticketId = rec.ok ? rec.ticket.id : null
  const ticketNumber = rec.ok ? rec.ticket.ticketNumber : null

  await recordUse({
    userId: gate.userId,
    tool: "analyzer",
    season: gate.season,
    week: gate.week,
    seasonType: gate.seasonType,
    requestHash,
    payload: result,
    ticketId,
  })

  const usage = await getToolUsage(gate.userId, gate.season, gate.week, gate.seasonType, gate.isPro)
  revalidatePath("/admin/review")
  revalidatePath("/admin/calibration")
  return { status: "ok", result, ticketId, ticketNumber, usage, replayed: false }
}

/* ----------------------------- generateParlaid ---------------------------- */

export async function generateParlaid(): Promise<GenerateParlaidResult> {
  const gate = await resolveGate("parlaid")
  if (!gate.ok) return gate.gate

  const board = await getLiveBoard()
  if (!board.ok) return { status: "error", error: board.error, retryable: board.retryable }

  const result = generateAllTickets(board.games)
  const hasTicket = result.results.some((r) => r.ticket != null)

  // Empty/declined generation never consumes an allowance.
  if (!hasTicket) {
    const usage = await getToolUsage(gate.userId, gate.season, gate.week, gate.seasonType, gate.isPro)
    return { status: "empty", result, usage }
  }

  // Deterministic signature over the built legs so a refresh of the same board
  // replays instead of consuming a second generation.
  const signature = result.results
    .flatMap((r) => (r.ticket ? r.ticket.legs.map((l) => `${r.profile}:${l.gameId}:${l.side}:${l.pickedSpread}`) : []))
    .sort()
    .join("|")
  const requestHash = toolRequestHash({
    userId: gate.userId,
    tool: "parlaid",
    season: gate.season,
    week: gate.week,
    seasonType: gate.seasonType,
    signature,
  })

  const existing = await findUseByHash(gate.userId, "parlaid", requestHash)
  if (existing) {
    const usage = await getToolUsage(gate.userId, gate.season, gate.week, gate.seasonType, gate.isPro)
    return { status: "ok", result, usage, replayed: true }
  }

  await recordUse({
    userId: gate.userId,
    tool: "parlaid",
    season: gate.season,
    week: gate.week,
    seasonType: gate.seasonType,
    requestHash,
    payload: result,
    ticketId: null,
  })

  const usage = await getToolUsage(gate.userId, gate.season, gate.week, gate.seasonType, gate.isPro)
  return { status: "ok", result, usage, replayed: false }
}

/* ---------------------------- admin: set limits --------------------------- */

export async function setToolLimitsAction(
  next: Partial<ToolLimits>,
): Promise<{ ok: true; limits: ToolLimits } | { ok: false; error: string }> {
  const admin = await getAdmin()
  if (!admin.ok) return { ok: false, error: "Unauthorized" }
  const limits = await setToolLimits(next, admin.userId)
  revalidatePath("/admin")
  return { ok: true, limits }
}
