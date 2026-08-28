/**
 * Frozen-model SIGNAL mapping — the ONLY place the customer-facing product
 * turns the frozen `B_residual::gbt` candidate's raw output into display values.
 *
 * HONESTY CONTRACT (see BSE-FINAL-SYSTEM-REPORT + trust-language objective):
 * The frozen model produces exactly ONE number per game — a residual `edge` in
 * points: the model's predicted home margin minus the market-implied home
 * margin. It does NOT produce a win probability, an expected value, a
 * confidence, or per-factor contributions. So this module derives ONLY what the
 * single edge legitimately supports:
 *   - a directional lean (home / away / none) at the frozen |edge| >= 1 gate,
 *   - a fair home spread (the model's implied line), and
 *   - a 0-100 "signal strength" rating that is a transparent, monotonic
 *     function of |edge| alone, routed through the EXISTING rating display
 *     bands (see rating-display.ts).
 *
 * The rating is signal STRENGTH, not a probability or a performance claim. The
 * candidate is PROMISING_BUT_UNPROVEN and under live 2026 shadow validation, so
 * every surface that shows this must label it "in validation — not a
 * performance guarantee." We never fabricate EV, win rate, or CLV here.
 */

/** Frozen candidate's firing threshold (points of edge). Mirrors the artifact. */
export const LEAN_THRESHOLD = 1

export type SignalLean = "home" | "away" | "none"

export interface BoardSignal {
  /** Model residual in points (predicted home margin − market-implied margin). */
  edge: number
  /** Directional lean at the frozen |edge| >= 1 gate. */
  lean: SignalLean
  /** Model's implied fair spread, home-relative (same convention as market). */
  fairHomeSpread: number | null
  /** 0-100 signal-strength rating (monotonic in |edge|). */
  rating: number
  /** True when |edge| >= threshold (a qualifying signal). */
  qualifies: boolean
  /** Whether the underlying feature row was complete/valid at score time. */
  featureComplete: boolean
}

/**
 * Directional lean from the residual edge. Positive edge => the model sees more
 * home margin than the market prices => home is the value side.
 */
export function leanFromEdge(edge: number, threshold: number = LEAN_THRESHOLD): SignalLean {
  if (!Number.isFinite(edge)) return "none"
  if (edge >= threshold) return "home"
  if (edge <= -threshold) return "away"
  return "none"
}

/**
 * Fair home spread implied by the model. market_implied_home_margin =
 * -market_spread_home, predicted_home_margin = market_implied + edge, and the
 * home-relative spread is the negative of the margin:
 *   fairHomeSpread = -(−market_spread_home + edge) = market_spread_home − edge.
 */
export function fairHomeSpreadFromEdge(
  marketSpreadHome: number | null | undefined,
  edge: number,
): number | null {
  if (marketSpreadHome == null || !Number.isFinite(marketSpreadHome) || !Number.isFinite(edge)) {
    return null
  }
  return Math.round((marketSpreadHome - edge) * 10) / 10
}

/**
 * 0-100 signal-strength rating from |edge|, tuned so the frozen gate lands
 * cleanly on the EXISTING display bands (rating-display.ts: >=80 STRONG,
 * 60-79 SOLID, <60 FADE):
 *   |edge| = 0    -> 52  (FADE  — model and market agree)
 *   |edge| = 1    -> 61  (SOLID — the qualifying signal)
 *   |edge| = 3    -> 79  (SOLID top)
 *   |edge| ~ 3.2  -> 80  (STRONG begins)
 *   |edge| >= 5   -> 95  (capped)
 * Transparent and monotonic — NOT a probability. Never exceeds 95 so the UI
 * never implies certainty.
 */
export function ratingFromEdge(edge: number): number {
  if (!Number.isFinite(edge)) return 0
  const raw = 52 + 9 * Math.abs(edge)
  return Math.min(95, Math.max(1, Math.round(raw)))
}

/** UI-ready description of a game's frozen-model signal, with team labels. */
export interface SignalDescription {
  rating: number
  lean: SignalLean
  leanTeam: string | null
  fairSpreadHome: number | null
  edgePoints: number
  qualifies: boolean
  threshold: number
  /** Hard honesty flag — every surface must present this as in-validation. */
  inValidation: true
  note: string
}

export const SIGNAL_VALIDATION_NOTE =
  "Signal from the frozen BSE model, under live 2026 validation. Not a performance guarantee."

/**
 * Turn a raw BoardSignal + team names into the UI/API display object. Single
 * source of truth so the board API, breakdown API, and page never drift.
 */
export function describeSignal(
  sig: BoardSignal,
  homeName: string,
  awayName: string,
  threshold: number = LEAN_THRESHOLD,
): SignalDescription {
  const leanTeam = sig.lean === "home" ? homeName : sig.lean === "away" ? awayName : null
  return {
    rating: sig.rating,
    lean: sig.lean,
    leanTeam,
    fairSpreadHome: sig.fairHomeSpread,
    edgePoints: sig.edge,
    qualifies: sig.qualifies,
    threshold,
    inValidation: true,
    note: SIGNAL_VALIDATION_NOTE,
  }
}

/** Build the full display signal from a stored edge + the market line used. */
export function buildBoardSignal(
  edge: number,
  marketSpreadHome: number | null | undefined,
  featureComplete: boolean,
  threshold: number = LEAN_THRESHOLD,
): BoardSignal {
  const lean = leanFromEdge(edge, threshold)
  return {
    edge: Math.round(edge * 100) / 100,
    lean,
    fairHomeSpread: fairHomeSpreadFromEdge(marketSpreadHome, edge),
    rating: ratingFromEdge(edge),
    qualifies: lean !== "none",
    featureComplete,
  }
}
