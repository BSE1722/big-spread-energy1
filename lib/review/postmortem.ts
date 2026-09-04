/**
 * POSTGAME POSTMORTEM — pure, deterministic derivations over ALREADY-RECORDED
 * fields. No I/O, no model math, no new numbers.
 *
 * Hard rules enforced here:
 *   - NEVER fabricate a BSE Rating. Legs with a null rating are excluded from
 *     confidence-calibration buckets and reported as "unrated".
 *   - NEVER auto-blame variance. Model-miss vs variance is a transparent
 *     heuristic derived only from recorded pregame risk flags + the margin the
 *     result missed by; it is always presented as a signal, never a verdict,
 *     and an admin note can override it.
 *   - NO OVERFITTING. This records patterns and recommends NO weight changes.
 */

import type { ReviewLeg, ReviewTicket } from "@/lib/review/types"

export interface CalibrationBucket {
  label: string
  min: number
  max: number
  sample: number
  wins: number
  losses: number
  pushes: number
  coverRate: number | null // wins / (wins+losses), null when no decided legs
  unitsDelta: number
}

export interface AltProtectionSummary {
  saved: number
  improvedNotNeeded: number
  stillLost: number
  favoriteLostNoProtection: number
  notApplicable: number
}

export type MissKind = "model_miss" | "variance" | "coin_flip" | "na"

export interface LegPostmortem {
  legIndex: number
  pickLabel: string
  matchup: string
  graded: boolean
  grade: ReviewLeg["grade"]
  marginVsSpread: number | null
  favoriteWonOutright: boolean | null
  bseRating: number | null
  rated: boolean
  warningSignsFlagged: Array<{ code: string; label: string }>
  /** Transparent signal only — see rules above. */
  missKind: MissKind
  missExplanation: string
  altProtectionOutcome: ReviewLeg["altProtectionOutcome"]
}

export interface TicketPostmortem {
  ticketNumber: number
  graded: boolean
  gotRight: string[]
  gotWrong: string[]
  warningSignsThatMattered: string[]
  altProtection: AltProtectionSummary
  calibration: CalibrationBucket[]
  unratedLegCount: number
  fragility: {
    tier: string | null
    score: number | null
    reasons: string[]
    weakestLegIndex: number | null
  }
  legs: LegPostmortem[]
  /** Honesty guardrail surfaced in the UI. */
  disclaimer: string
}

const CALIBRATION_DEFS: Array<{ label: string; min: number; max: number }> = [
  { label: "90–100", min: 90, max: 100 },
  { label: "80–89", min: 80, max: 89.999999 },
  { label: "70–79", min: 70, max: 79.999999 },
  { label: "60–69", min: 60, max: 69.999999 },
  { label: "< 60", min: -Infinity, max: 59.999999 },
]

function matchupOf(leg: ReviewLeg): string {
  return `${leg.awayTeam} @ ${leg.homeTeam}`
}

/**
 * Classify how a LOST leg missed. This is a heuristic over recorded data — it
 * never overrides an admin's own note and never claims certainty.
 *   - coin_flip: within a field goal of the number (|marginVsSpread| <= 3)
 *   - model_miss: it lost AND the analyzer had NOT flagged a relevant warning
 *     (the read was clean but wrong → a genuine model miss to record)
 *   - variance: it lost but the analyzer HAD flagged warning signs (the risk it
 *     called out is what showed up) — recorded as variance-consistent, not proof
 */
function classifyMiss(leg: ReviewLeg): { kind: MissKind; explanation: string } {
  if (leg.status !== "graded" || leg.grade == null) {
    return { kind: "na", explanation: "Not yet graded." }
  }
  if (leg.grade === "win") {
    return { kind: "na", explanation: "Leg won — no miss to analyze." }
  }
  if (leg.grade === "push") {
    return { kind: "na", explanation: "Leg pushed — no win or loss to analyze." }
  }
  const margin = leg.marginVsSpread
  const flagged = Array.isArray(leg.riskFlags) ? (leg.riskFlags as Array<{ code: string; label: string }>) : []

  if (margin != null && Math.abs(margin) <= 3) {
    return {
      kind: "coin_flip",
      explanation: `Missed by ${fmtPts(Math.abs(margin))} — inside a field goal. A near-coin-flip result, not a signal the read was wrong.`,
    }
  }
  if (flagged.length > 0) {
    return {
      kind: "variance",
      explanation: `BSE flagged ${flagged.length} warning sign${flagged.length === 1 ? "" : "s"} pregame (${flagged
        .map((f) => f.label)
        .join(", ")}). The risk it called out is consistent with this loss — recorded as variance-consistent, not proof either way.`,
    }
  }
  return {
    kind: "model_miss",
    explanation:
      margin != null
        ? `Missed by ${fmtPts(Math.abs(margin))} with no pregame warning flags. The read was clean but wrong — recorded as a genuine model miss.`
        : "Lost with no pregame warning flags. Recorded as a genuine model miss.",
  }
}

function fmtPts(n: number): string {
  const r = Math.round(n * 10) / 10
  return `${r} pt${Math.abs(r) === 1 ? "" : "s"}`
}

export function buildTicketPostmortem(ticket: ReviewTicket, legs: ReviewLeg[]): TicketPostmortem {
  const ordered = [...legs].sort((a, b) => a.legIndex - b.legIndex)
  const graded = ticket.status === "graded"

  const legPMs: LegPostmortem[] = ordered.map((leg) => {
    const miss = classifyMiss(leg)
    const flagged = Array.isArray(leg.riskFlags) ? (leg.riskFlags as Array<{ code: string; label: string }>) : []
    return {
      legIndex: leg.legIndex,
      pickLabel: leg.pickLabel,
      matchup: matchupOf(leg),
      graded: leg.status === "graded",
      grade: leg.grade,
      marginVsSpread: leg.marginVsSpread,
      favoriteWonOutright: leg.favoriteWonOutright,
      bseRating: leg.bseRating,
      rated: leg.bseRating != null,
      warningSignsFlagged: flagged.map((f) => ({ code: f.code, label: f.label })),
      missKind: miss.kind,
      missExplanation: miss.explanation,
      altProtectionOutcome: leg.altProtectionOutcome,
    }
  })

  // What BSE got right / wrong (only from graded legs).
  const gotRight: string[] = []
  const gotWrong: string[] = []
  for (const l of legPMs) {
    if (!l.graded) continue
    if (l.grade === "win") gotRight.push(`${l.pickLabel} (${l.matchup}) cashed${marginNote(l.marginVsSpread)}.`)
    else if (l.grade === "loss") gotWrong.push(`${l.pickLabel} (${l.matchup}) lost${marginNote(l.marginVsSpread)} — ${labelMiss(l.missKind)}.`)
  }

  // Warning signs that mattered: flags on legs that then lost.
  const warningSignsThatMattered: string[] = []
  for (const l of legPMs) {
    if (l.graded && l.grade === "loss" && l.warningSignsFlagged.length > 0) {
      warningSignsThatMattered.push(
        `${l.pickLabel}: flagged ${l.warningSignsFlagged.map((w) => w.label).join(", ")} — then lost.`,
      )
    }
  }

  // Alt-line protection tally.
  const altProtection: AltProtectionSummary = {
    saved: 0,
    improvedNotNeeded: 0,
    stillLost: 0,
    favoriteLostNoProtection: 0,
    notApplicable: 0,
  }
  for (const leg of ordered) {
    switch (leg.altProtectionOutcome) {
      case "saved":
        altProtection.saved += 1
        break
      case "improved_not_needed":
        altProtection.improvedNotNeeded += 1
        break
      case "still_lost":
        altProtection.stillLost += 1
        break
      case "favorite_lost_no_protection":
        altProtection.favoriteLostNoProtection += 1
        break
      default:
        altProtection.notApplicable += 1
    }
  }

  // Confidence calibration — RATED legs only. Unrated legs are excluded.
  const rated = ordered.filter((l) => l.bseRating != null && l.status === "graded")
  const unratedLegCount = ordered.filter((l) => l.bseRating == null).length
  const calibration: CalibrationBucket[] = CALIBRATION_DEFS.map((def) => {
    const inBucket = rated.filter((l) => (l.bseRating as number) >= def.min && (l.bseRating as number) <= def.max)
    let wins = 0
    let losses = 0
    let pushes = 0
    let unitsDelta = 0
    for (const l of inBucket) {
      if (l.grade === "win") wins += 1
      else if (l.grade === "loss") losses += 1
      else if (l.grade === "push") pushes += 1
      unitsDelta += l.unitsDelta ?? 0
    }
    const decided = wins + losses
    return {
      label: def.label,
      min: def.min,
      max: def.max,
      sample: inBucket.length,
      wins,
      losses,
      pushes,
      coverRate: decided > 0 ? wins / decided : null,
      unitsDelta: Math.round(unitsDelta * 100) / 100,
    }
  })

  const fragReasons = Array.isArray(ticket.fragilityReasons) ? (ticket.fragilityReasons as string[]) : []

  return {
    ticketNumber: ticket.ticketNumber,
    graded,
    gotRight,
    gotWrong,
    warningSignsThatMattered,
    altProtection,
    calibration,
    unratedLegCount,
    fragility: {
      tier: ticket.fragilityTier,
      score: ticket.fragilityScore,
      reasons: fragReasons,
      weakestLegIndex: ticket.weakestLegIndex,
    },
    legs: legPMs,
    disclaimer:
      "Recorded from the frozen pregame analysis and official final scores. Miss-vs-variance labels are transparent heuristics from pregame risk flags, not proof. This postmortem records patterns only and recommends no model weight changes.",
  }
}

function marginNote(marginVsSpread: number | null): string {
  if (marginVsSpread == null) return ""
  const abs = Math.abs(marginVsSpread)
  if (marginVsSpread > 0) return ` by ${fmtPts(abs)}`
  if (marginVsSpread < 0) return ` by ${fmtPts(abs)}`
  return " (push)"
}

function labelMiss(kind: MissKind): string {
  switch (kind) {
    case "model_miss":
      return "recorded model miss"
    case "variance":
      return "variance-consistent (flagged pregame)"
    case "coin_flip":
      return "near coin-flip"
    default:
      return "n/a"
  }
}
