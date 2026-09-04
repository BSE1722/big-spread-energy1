/**
 * PREGAME TICKET-FRAGILITY — pure and deterministic. Computed ONCE at record
 * time from the frozen legs and never recomputed with hindsight. This is a
 * structural risk read (how many ways the parlay can break), NOT a
 * win-probability or EV claim, and it introduces no new model numbers — it only
 * combines signals the analyzer already recorded per leg (risk flags, line
 * edge, price read, whether the pick sits on a favorite).
 */

import type { RecordLegInput } from "@/lib/review/types"

export type FragilityTier = "LOW" | "MODERATE" | "HIGH" | "EXTREME"

export interface FragilityResult {
  tier: FragilityTier
  score: number // 0..100, higher = more fragile
  reasons: string[]
  weakestLegIndex: number | null
}

/** Per-leg structural fragility contribution (0..100). */
function legFragility(leg: RecordLegInput): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 20 // every added leg carries base parlay fragility

  const flags = leg.riskFlags ?? []
  if (flags.length > 0) {
    score += Math.min(30, flags.length * 12)
    reasons.push(`${flags.length} risk flag${flags.length === 1 ? "" : "s"} (${flags.map((f) => f.label).join(", ")})`)
  }

  // Thin line edge = little margin for error against the number.
  if (leg.lineEdge != null) {
    if (Math.abs(leg.lineEdge) < 0.5) {
      score += 22
      reasons.push(`line edge under 0.5 pt`)
    } else if (Math.abs(leg.lineEdge) < 1) {
      score += 12
      reasons.push(`thin line edge (${leg.lineEdge.toFixed(1)} pt)`)
    }
  } else {
    score += 8
    reasons.push("no recorded line edge")
  }

  // A classification the analyzer itself did not endorse strongly.
  const c = (leg.classification ?? "").toUpperCase()
  if (c && !c.startsWith("STRONG")) {
    score += 10
    reasons.push(`non-strong read (${leg.classification})`)
  }

  // Priced worse than a standard -110 lay adds fragility to the combined juice.
  if (leg.priceAmerican != null && leg.priceAmerican < -140) {
    score += 8
    reasons.push(`heavy price (${leg.priceAmerican})`)
  }

  return { score: Math.min(100, score), reasons }
}

export function computeFragility(legs: RecordLegInput[]): FragilityResult {
  if (legs.length === 0) {
    return { tier: "LOW", score: 0, reasons: ["No legs recorded."], weakestLegIndex: null }
  }

  const per = legs.map((leg, i) => ({ i, ...legFragility(leg) }))

  // Ticket score: average leg fragility, escalated by leg count (each extra leg
  // multiplies the ways to lose). Capped at 100.
  const avg = per.reduce((s, p) => s + p.score, 0) / per.length
  const countPenalty = Math.min(35, Math.max(0, legs.length - 2) * 7)
  const score = Math.min(100, Math.round(avg * 0.7 + countPenalty + (legs.length >= 4 ? 8 : 0)))

  let tier: FragilityTier = "LOW"
  if (score >= 75) tier = "EXTREME"
  else if (score >= 55) tier = "HIGH"
  else if (score >= 35) tier = "MODERATE"

  const weakest = per.reduce((a, b) => (b.score > a.score ? b : a), per[0])

  const reasons: string[] = [
    `${legs.length}-leg parlay${legs.length >= 4 ? " — every leg must hit" : ""}.`,
  ]
  if (weakest.reasons.length > 0) {
    reasons.push(`Weakest leg (#${weakest.i + 1}): ${weakest.reasons.join("; ")}.`)
  }
  const flaggedCount = per.filter((p) => p.reasons.some((r) => r.includes("risk flag"))).length
  if (flaggedCount > 0) reasons.push(`${flaggedCount} leg(s) carried pregame risk flags.`)

  return { tier, score, reasons, weakestLegIndex: weakest.i }
}
