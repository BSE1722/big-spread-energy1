import type { BetSide, BetClassification, PriceTier, ParlaySummary } from "@/lib/bse/price-aware"
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
  priceTier: PriceTier | null
  impliedBreakeven: number | null
  /** Canonical Board rating for this game (real 0–100 or null). */
  bseRating: number | null
  usingAlt: boolean
}

export interface AnalyzerResult {
  legs: AnalyzerLegResult[]
  combinedAmerican: number | null
  summary: ParlaySummary
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
