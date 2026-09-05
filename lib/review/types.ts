import type { reviewTickets, reviewLegs } from "@/lib/db/schema"

export type ReviewTicket = typeof reviewTickets.$inferSelect
export type ReviewLeg = typeof reviewLegs.$inferSelect

/** A risk flag exactly as the analyzer recorded it (frozen). */
export interface RecordedRiskFlag {
  code: string
  label: string
  detail?: string
}

/** Frozen alt-spread recommendation captured at analysis time. */
export interface RecordedAltRecommendation {
  pickedSpread: number | null
  price: number | null
  verdict: string | null
  worthwhile: boolean | null
  note?: string | null
}

/** Contextual info the analyzer had pregame (display-only; never model math). */
export interface RecordedContext {
  weather?: string | null
  injuries?: string | null
  matchup?: string | null
  market?: string | null
}

/** One leg as submitted to the recorder (pregame zone only). */
export interface RecordLegInput {
  gameId?: string | null
  season: number
  week: number
  seasonType?: string
  homeTeam: string
  awayTeam: string
  kickoffIso?: string | null
  market?: "spread" | "total" | "moneyline"
  pickSide: "home" | "away" | "over" | "under"
  pickLabel: string
  lineValue: number | null
  priceAmerican: number | null
  book?: string
  /**
   * Optional explicit rating override. Normally OMITTED: the recorder fills
   * this server-side from the canonical Board signal loader at analysis time
   * (real 0–100 value or null). Never fabricated by callers.
   */
  bseRating?: number | null
  classification?: string | null
  lineEdge?: number | null
  fairLine?: number | null
  recommendation?: string | null
  confidenceRead?: string | null
  riskFlags?: RecordedRiskFlag[]
  altRecommendation?: RecordedAltRecommendation | null
  contextInfo?: RecordedContext | null
}

export interface RecordTicketInput {
  title?: string | null
  source: "admin" | "analyzer"
  season: number
  week: number
  seasonType?: string
  analyzedAtIso?: string | null
  createdBy?: string | null
  notes?: string | null
  combinedPriceAmerican?: number | null
  /** Optional admin-asserted whole-ticket ground truth. */
  recorded?: { legCount?: number; wins?: number; losses?: number; pushes?: number } | null
  legs: RecordLegInput[]
}
