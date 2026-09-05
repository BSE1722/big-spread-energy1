import type {
  BetSide,
  BetClassification,
  PriceTier,
  ParlaySummary,
  LegTreatment,
  TicketDisposition,
} from "@/lib/bse/price-aware"
import type { GenerateResult } from "@/lib/parlay/generate"

/**
 * Client-safe shared types for the gated tools (analyzer + Getting Parlaid).
 * Kept free of any server-only import so both the client hooks/components and
 * the server actions/services can depend on them.
 */

export type ToolName = "analyzer" | "parlaid"

export interface ToolUsageInfo {
  tool: ToolName
  used: number
  limit: number
  remaining: number
  /** Pro users have no weekly cap. */
  unlimited: boolean
}

export interface WeeklyToolUsage {
  season: number
  week: number
  seasonType: string
  analyzer: ToolUsageInfo
  parlaid: ToolUsageInfo
}

export interface LastToolPayload {
  payload: unknown
  ticketId: string | null
  createdAt: string
  season: number
  week: number
}

/* --------------------------------- analyzer -------------------------------- */

/** One leg exactly as the client's interactive analyzer builds it. */
export interface AnalyzerLegInput {
  gameId: string
  side: BetSide
  /** Alternate home-relative spread the user typed from their own DK slip; null = DK main line. */
  altHomeSpread: number | null
  /** Alternate American price the user typed; null = DK main-line price. */
  altPrice: number | null
}

/** Server-authoritative graded read for one analyzed leg. */
export interface AnalyzerLegResult {
  gameId: string
  matchup: string
  kickoffIso: string | null
  pickSide: BetSide
  pickedTeamName: string
  pickLabel: string
  /** Team-facing spread actually graded (alt when entered, else DK main). */
  pickedSpread: number | null
  price: number | null
  /** Team-facing BSE fair spread for the pick side. */
  fairPicked: number | null
  lineEdge: number | null
  classification: BetClassification
  /** Action-language relabel of `classification` (pure 1:1, no new math). */
  treatment: LegTreatment
  priceTier: PriceTier | null
  impliedBreakeven: number | null
  /** Canonical Board rating for this game (real 0–100 or null). */
  bseRating: number | null
  usingAlt: boolean
}

/** A validated board pick offered as a replacement for a weak leg. */
export interface AnalyzerSwapCandidate {
  gameId: string
  matchup: string
  pickLabel: string
  bseRating: number | null
  /** Team-facing market spread for the candidate pick side. */
  pickedSpread: number | null
  /** Team-facing BSE fair spread for the candidate pick side. */
  fairPicked: number | null
  lineEdge: number | null
  priceTier: PriceTier | null
  impliedBreakeven: number | null
}

/** One weak leg paired with its best validated upgrade (or null when none). */
export interface AnalyzerSwap {
  legGameId: string
  legLabel: string
  legTreatment: LegTreatment
  /** null = no validated upgrade currently on the board. */
  candidate: AnalyzerSwapCandidate | null
}

export interface AnalyzerResult {
  legs: AnalyzerLegResult[]
  combinedAmerican: number | null
  summary: ParlaySummary
  /** Whole-ticket call derived deterministically from the summary counts. */
  disposition: TicketDisposition
  /** Plain-English ticket read, generated from the same counts/labels. */
  narrative: string
  /** Upgrade suggestions for each non-KEEP leg (candidate null when none). */
  swaps: AnalyzerSwap[]
  weakestLabel: string | null
  strongestLabel: string | null
  analyzedAtIso: string
}

/* ------------------------------ action results ----------------------------- */

export type ToolGateResult =
  | { status: "auth" }
  | { status: "locked"; usage: WeeklyToolUsage; lastTicket: LastToolPayload | null }
  | { status: "error"; error: string; retryable?: boolean }

export type RunAnalyzerResult =
  | ToolGateResult
  | { status: "ok"; result: AnalyzerResult; ticketId: string | null; ticketNumber: number | null; usage: WeeklyToolUsage; replayed: boolean }

export type GenerateParlaidResult =
  | ToolGateResult
  | { status: "empty"; result: GenerateResult; usage: WeeklyToolUsage }
  | { status: "ok"; result: GenerateResult; usage: WeeklyToolUsage; replayed: boolean }
