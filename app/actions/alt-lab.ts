"use server"

import { getAccessState, canViewBreakdown } from "@/lib/access"
import { assembleBreakdown } from "@/lib/breakdown/assemble"
import { evaluateBet, assessPointsPurchase, CLASSIFICATION_COPY, type BetSide } from "@/lib/bse/price-aware"

/**
 * Evaluate a user-entered alternate spread for one game against the FINAL BSE
 * fair spread. Pure price-aware math (no EV, no win-prob) — line edge, points
 * of protection vs the DK main line, implied breakeven change, cost per point,
 * and whether it clears BSE's line-edge gate.
 *
 * SERVER-GATED: recomputes the game's fair spread server-side and refuses
 * unless the viewer may see this game's breakdown, so the premium engine is
 * never exposed to a non-subscriber. The entered line/price are never trusted
 * for the fair number — only for the comparison.
 */
export interface AltCheckResult {
  ok: boolean
  error?: string
  side: BetSide
  pickedSpread: number | null
  price: number | null
  lineEdge: number | null
  classification: string
  classificationLabel: string
  classificationBlurb: string
  reason: string
  meetsThreshold: boolean
  impliedBreakevenPct: number | null
  priceTier: string
  // Protection vs the DK main line for the same side (when a main line exists).
  protectionPoints: number | null
  breakevenCostPct: number | null
  costPerPoint: number | null
  protectionWorthwhile: boolean | null
  protectionVerdict: string | null
}

export async function checkAlternate(input: {
  gameId: string
  side: BetSide
  spread: number // team-facing spread the user typed (e.g. -10 for a favorite, +11.5 for a dog)
  price: number // American odds
}): Promise<AltCheckResult> {
  const base: AltCheckResult = {
    ok: false,
    side: input.side,
    pickedSpread: null,
    price: null,
    lineEdge: null,
    classification: "INSUFFICIENT_DATA",
    classificationLabel: "",
    classificationBlurb: "",
    reason: "",
    meetsThreshold: false,
    impliedBreakevenPct: null,
    priceTier: "unknown",
    protectionPoints: null,
    breakevenCostPct: null,
    costPerPoint: null,
    protectionWorthwhile: null,
    protectionVerdict: null,
  }

  const access = await getAccessState()
  if (!canViewBreakdown(access, input.gameId)) {
    return { ...base, error: "This breakdown is locked. Unlock it to use the Alternate Spread Lab." }
  }

  const assembled = await assembleBreakdown(input.gameId)
  if (!assembled.found || !assembled.analysis) {
    return { ...base, error: "Game not found." }
  }
  const finalFairHome = assembled.analysis.context.finalFairHomeSpread
  if (finalFairHome == null) {
    return { ...base, error: "BSE has not scored this game yet, so there is no fair line to compare against." }
  }

  if (!Number.isFinite(input.spread) || !Number.isFinite(input.price)) {
    return { ...base, error: "Enter a valid spread and American price." }
  }

  // Convert the team-facing spread the user typed into a home-relative number.
  const offeredHomeSpread = input.side === "home" ? input.spread : -input.spread

  const evalResult = evaluateBet({
    fairHomeSpread: finalFairHome,
    offeredHomeSpread,
    price: input.price,
    side: input.side,
  })
  const copy = CLASSIFICATION_COPY[evalResult.classification]

  // Protection vs the DK main line for the same side, when available.
  const mainEval = input.side === "home" ? assembled.analysis.altLab.homeMainEval : assembled.analysis.altLab.awayMainEval
  let protectionPoints: number | null = null
  let breakevenCostPct: number | null = null
  let costPerPoint: number | null = null
  let protectionWorthwhile: boolean | null = null
  let protectionVerdict: string | null = null
  if (mainEval && mainEval.pickedSpread != null && mainEval.price != null) {
    const purchase = assessPointsPurchase(
      { pickedSpread: mainEval.pickedSpread, price: mainEval.price },
      { pickedSpread: evalResult.pickedSpread, price: input.price },
    )
    protectionPoints = purchase.pointsGained
    breakevenCostPct = purchase.breakevenCostPct
    costPerPoint = purchase.costPerPoint
    protectionWorthwhile = purchase.worthwhile
    protectionVerdict = purchase.verdict
  }

  const meetsThreshold =
    evalResult.classification === "STRONG_LINE_PRICE_OK" || evalResult.classification === "GOOD_LINE_EXPENSIVE"

  return {
    ok: true,
    side: input.side,
    pickedSpread: evalResult.pickedSpread,
    price: input.price,
    lineEdge: evalResult.lineEdge,
    classification: evalResult.classification,
    classificationLabel: copy.label,
    classificationBlurb: copy.blurb,
    reason: evalResult.reason,
    meetsThreshold,
    impliedBreakevenPct: evalResult.impliedBreakeven != null ? Math.round(evalResult.impliedBreakeven * 1000) / 10 : null,
    priceTier: evalResult.priceTier,
    protectionPoints,
    breakevenCostPct,
    costPerPoint,
    protectionWorthwhile,
    protectionVerdict,
  }
}
