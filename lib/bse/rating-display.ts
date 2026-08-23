/**
 * BSE Rating DISPLAY bands for the Board redesign — the numeric 0–100 rating
 * shown on every matchup card. NO stars anywhere.
 *
 *   80–100 → STRONG (green)
 *   60–79  → SOLID  (yellow)
 *   0–59   → FADE   (red)
 *
 * When the model has not produced a real rating, callers render "—".
 * Never fabricate a rating. This is presentation-only; the scoring math lives
 * in ./rating.ts and is not touched here.
 */

export type RatingBand = "strong" | "mid" | "weak"

export interface RatingDisplay {
  band: RatingBand
  label: string
  /** Tailwind text color class for the numeric value. */
  colorClass: string
}

const BAND_LABEL: Record<RatingBand, string> = {
  strong: "STRONG",
  mid: "SOLID",
  weak: "FADE",
}

const BAND_COLOR: Record<RatingBand, string> = {
  strong: "text-rating-strong",
  mid: "text-rating-mid",
  weak: "text-rating-weak",
}

export function ratingBand(rating: number): RatingBand {
  if (rating >= 80) return "strong"
  if (rating >= 60) return "mid"
  return "weak"
}

/** Display metadata for a rating, or null when there is no real rating. */
export function ratingDisplay(rating: number | null | undefined): RatingDisplay | null {
  if (rating == null || Number.isNaN(rating)) return null
  const band = ratingBand(rating)
  return { band, label: BAND_LABEL[band], colorClass: BAND_COLOR[band] }
}
