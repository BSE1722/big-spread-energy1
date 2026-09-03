/**
 * BSE PRICE-AWARE DECISION LAYER
 * ==============================
 *
 * This module begins AFTER the frozen model has produced its Raw BSE Fair Line.
 * It NEVER touches the model, the feature recipe, the residual, or the fair-line
 * math (see lib/bse/model-signal.ts for that frozen mapping). Everything here is
 * pure arithmetic over two already-produced numbers:
 *
 *   1. the Raw BSE Fair Line (home-relative spread), from the frozen model, and
 *   2. a DraftKings offered spread + its American price, from the market.
 *
 * WHY THIS EXISTS
 * ---------------
 * A spread can be >= 1 point better than the BSE Fair Line (LINE VALUE) and
 * still be a bad bet because buying that number costs a punitive price. This
 * layer separates LINE VALUE from BET VALUE and refuses to call something a good
 * bet on point edge alone.
 *
 * WHAT WE CAN AND CANNOT COMPUTE (read this before extending)
 * -----------------------------------------------------------
 * CAN (defensible arithmetic, no calibration required):
 *   - Line edge in points: offered spread vs BSE fair spread.
 *   - Implied breakeven probability from an American price (the win rate the
 *     PRICE requires to profit). This is a definitional identity, not a claim
 *     about how often the bet wins.
 *   - No-vig fair probability of a two-sided market (removes the book margin).
 *
 * CANNOT (would require calibration we do not have):
 *   - TRUE EXPECTED VALUE. EV needs BSE's probability that THIS SPREAD covers.
 *     The frozen model emits a point residual only; we have NO validated map
 *     from point edge to cover probability (the 2026 shadow experiment that
 *     could produce one has not graded yet). Therefore `EV_AVAILABLE = false`
 *     and this module never returns an EV number. Do not add one until a
 *     validated calibration exists.
 *
 * So the output is a PRICE-AWARE CLASSIFICATION, not an EV. It combines a
 * point-edge gate with a price-cost gate, both transparent and documented.
 */

/** Whether this layer can defensibly compute true EV. It cannot (see header). */
export const EV_AVAILABLE = false as const

/** Frozen line-edge gate, in points. Mirrors the model's |edge| >= 1 lean gate. */
export const LINE_EDGE_GATE = 1

/**
 * Price bands, expressed as implied breakeven probability of the price paid.
 * These describe how expensive the PRICE is, NOT how likely the bet is to win.
 *   -110 -> 0.524 (standard main-line juice)  => reasonable
 *   -140 -> 0.583                              => reasonable ceiling
 *   -200 -> 0.667                              => expensive ceiling
 *   worse than -200                            => prohibitive
 * Override via env for tuning WITHOUT code changes; never derived from results.
 */
export const PRICE_REASONABLE_MAX = Number(process.env.BSE_PRICE_REASONABLE_MAX ?? 0.58)
export const PRICE_EXPENSIVE_MAX = Number(process.env.BSE_PRICE_EXPENSIVE_MAX ?? 0.667)

export type BetSide = "home" | "away"

/** One rung of a DraftKings spread ladder: a spread and the price to take it. */
export interface LadderRung {
  /** Home-relative spread offered (e.g. -7 means home laying 7). */
  homeSpread: number
  /** American price for the side named in the evaluation (e.g. -190). */
  price: number | null
}

export type PriceTier = "reasonable" | "expensive" | "prohibitive" | "unknown"

export type BetClassification =
  | "STRONG_LINE_PRICE_OK"
  | "GOOD_LINE_EXPENSIVE"
  | "NO_EDGE"
  | "INSUFFICIENT_DATA"

/** Brand-consistent display label + one-line meaning for each classification. */
export const CLASSIFICATION_COPY: Record<BetClassification, { label: string; blurb: string }> = {
  STRONG_LINE_PRICE_OK: {
    label: "STRONG LINE — PRICE OK",
    blurb: "At least a point better than the BSE fair line, at a price that isn't punitive.",
  },
  GOOD_LINE_EXPENSIVE: {
    label: "GOOD LINE — EXPENSIVE",
    blurb: "Beats the BSE fair line on points, but you're paying up for it — weigh the juice.",
  },
  NO_EDGE: {
    label: "NO BSE EDGE",
    blurb: "This number isn't a full point better than the BSE fair line.",
  },
  INSUFFICIENT_DATA: {
    label: "INSUFFICIENT DATA",
    blurb: "Missing a BSE grade or a DraftKings price, so BSE won't assert a call.",
  },
}

/* --------------------------------- Prices --------------------------------- */

/**
 * American odds -> implied breakeven probability (vig-inclusive). This is the
 * win rate the PRICE requires to break even, a definitional identity:
 *   favorite (odds < 0): (-odds) / (-odds + 100)
 *   underdog (odds > 0): 100 / (odds + 100)
 * Returns null for a missing/zero price. NOT a claim about the bet's win rate.
 */
export function americanToImpliedProb(odds: number | null | undefined): number | null {
  if (odds == null || !Number.isFinite(odds) || odds === 0) return null
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100)
}

/**
 * Remove the book's margin from a two-sided price to get the fair (no-vig)
 * probability of each side. Pure arithmetic on the two offered prices; returns
 * null when either side is missing. Used only to SHOW the market's no-vig read
 * of a specific line — never as a BSE win probability.
 */
export function noVigTwoWay(
  pricePicked: number | null | undefined,
  priceOther: number | null | undefined,
): { picked: number; other: number } | null {
  const a = americanToImpliedProb(pricePicked)
  const b = americanToImpliedProb(priceOther)
  if (a == null || b == null) return null
  const sum = a + b
  if (sum <= 0) return null
  return { picked: a / sum, other: b / sum }
}

/** Classify how expensive a price is by its implied breakeven. */
export function priceTier(price: number | null | undefined): PriceTier {
  const p = americanToImpliedProb(price)
  if (p == null) return "unknown"
  if (p <= PRICE_REASONABLE_MAX) return "reasonable"
  if (p <= PRICE_EXPENSIVE_MAX) return "expensive"
  return "prohibitive"
}

/** American odds -> decimal odds. Pure identity; used for combining leg prices. */
export function decimalFromAmerican(a: number): number {
  return a < 0 ? 1 + 100 / -a : 1 + a / 100
}
/** Decimal odds -> American odds. Null when decimal is degenerate (<= 1). */
export function americanFromDecimal(d: number): number | null {
  if (!Number.isFinite(d) || d <= 1) return null
  return d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1))
}

/**
 * Combine per-leg American prices into the real parlay price by multiplying
 * decimal odds. This is the MARKET price (juice) of the combined ticket — NOT
 * an expected value or win-probability claim. Returns null if any leg is
 * missing a price, so we never show a partial/guessed combined number.
 */
export function combineAmericanPrices(
  prices: (number | null | undefined)[],
): { decimal: number; american: number | null } | null {
  if (prices.length === 0) return null
  let dec = 1
  for (const p of prices) {
    if (p == null || !Number.isFinite(p)) return null
    dec *= decimalFromAmerican(p)
  }
  return { decimal: Math.round(dec * 1000) / 1000, american: americanFromDecimal(dec) }
}

/* -------------------------------- Line edge ------------------------------- */

/**
 * Line edge in points for a given side, generalizing the frozen model's `edge`
 * to ANY offered spread.
 *
 * Convention (home-relative spreads, negative = home favored):
 *   lineEdge(home) = offeredHomeSpread - fairHomeSpread
 *   lineEdge(away) = -(lineEdge(home))
 *
 * CONSISTENCY GUARANTEE (tested in the self-test below): at the MAIN line,
 * offeredHomeSpread === marketSpreadHome, so lineEdge(home) equals the frozen
 * model's `edge` exactly (edge = marketSpreadHome - fairHomeSpread). This layer
 * only extends the same signed quantity to alternate numbers; it never
 * recomputes or alters the fair line.
 *
 * Positive result = the taken number is better than BSE fair for that side.
 */
export function lineEdgePoints(
  fairHomeSpread: number | null | undefined,
  offeredHomeSpread: number | null | undefined,
  side: BetSide,
): number | null {
  if (
    fairHomeSpread == null ||
    offeredHomeSpread == null ||
    !Number.isFinite(fairHomeSpread) ||
    !Number.isFinite(offeredHomeSpread)
  ) {
    return null
  }
  const home = offeredHomeSpread - fairHomeSpread
  const edge = side === "home" ? home : -home
  return Math.round(edge * 100) / 100
}

/* ------------------------------ Classification ---------------------------- */

export interface BetEvaluation {
  side: BetSide
  /** Home-relative spread being taken. */
  offeredHomeSpread: number | null
  /** The team-facing spread for the picked side (away = -homeSpread). */
  pickedSpread: number | null
  /** American price for the picked side. */
  price: number | null
  /** Points better (or worse) than the BSE fair line for this side. */
  lineEdge: number | null
  /** Implied breakeven of the price paid (vig-inclusive). Not a win rate claim. */
  impliedBreakeven: number | null
  priceTier: PriceTier
  classification: BetClassification
  /** Short machine-readable reason for the classification. */
  reason: string
  /** Hard reminder that no EV/win-probability is asserted. */
  evAvailable: false
}

export interface EvaluateArgs {
  /** Raw BSE Fair Line (home-relative). Null when the game has no valid grade. */
  fairHomeSpread: number | null | undefined
  /** Home-relative spread being taken from DraftKings. */
  offeredHomeSpread: number | null | undefined
  /** American price for the side being taken. */
  price: number | null | undefined
  side: BetSide
  lineEdgeGate?: number
}

/**
 * Evaluate a single spread bet against the BSE fair line AND its price.
 * Never labels a bet good on line edge alone: an expensive price is called out,
 * and a missing grade or price yields INSUFFICIENT_DATA rather than a guess.
 */
export function evaluateBet(args: EvaluateArgs): BetEvaluation {
  const gate = args.lineEdgeGate ?? LINE_EDGE_GATE
  const side = args.side
  const offeredHomeSpread =
    args.offeredHomeSpread != null && Number.isFinite(args.offeredHomeSpread)
      ? args.offeredHomeSpread
      : null
  const price = args.price != null && Number.isFinite(args.price) ? args.price : null
  const pickedSpread = offeredHomeSpread == null ? null : side === "home" ? offeredHomeSpread : -offeredHomeSpread

  const edge = lineEdgePoints(args.fairHomeSpread, offeredHomeSpread, side)
  const breakeven = americanToImpliedProb(price)
  const tier = priceTier(price)

  let classification: BetClassification
  let reason: string

  if (edge == null || price == null) {
    classification = "INSUFFICIENT_DATA"
    reason =
      edge == null && price == null
        ? "no BSE grade and no price"
        : edge == null
          ? "no BSE grade for this game"
          : "no DraftKings price for this number"
  } else if (edge < gate) {
    classification = "NO_EDGE"
    reason = `line edge ${edge.toFixed(1)} pt < ${gate} pt gate`
  } else if (tier === "reasonable") {
    classification = "STRONG_LINE_PRICE_OK"
    reason = `line edge ${edge.toFixed(1)} pt, price breakeven ${(breakeven! * 100).toFixed(1)}%`
  } else {
    // Favorable line but the price is expensive or prohibitive.
    classification = "GOOD_LINE_EXPENSIVE"
    reason = `line edge ${edge.toFixed(1)} pt, but price breakeven ${(breakeven! * 100).toFixed(1)}% (${tier})`
  }

  return {
    side,
    offeredHomeSpread,
    pickedSpread,
    price,
    lineEdge: edge,
    impliedBreakeven: breakeven,
    priceTier: tier,
    classification,
    reason,
    evAvailable: false,
  }
}

/* --------------------------- Alternate selection -------------------------- */

export interface LadderSelection {
  best: BetEvaluation | null
  /** Every rung evaluated, best-first, so the tradeoff is auditable. */
  evaluated: BetEvaluation[]
  /** True when only the main line was available (no alternate rungs ingested). */
  mainLineOnly: boolean
  note: string
}

/**
 * Choose the BEST AVAILABLE BSE NUMBER AT AN ACCEPTABLE PRICE from a real
 * DraftKings ladder — NOT simply the most points bought.
 *
 * Rule (transparent, no EV):
 *   1. Evaluate every rung for the chosen side.
 *   2. Prefer rungs classified STRONG_LINE_PRICE_OK; among those, take the one
 *      with the largest line edge (most protection at an acceptable price).
 *   3. If none are acceptably priced, fall back to the best GOOD_LINE_EXPENSIVE
 *      (largest line edge) so the caller can see the tradeoff and decide.
 *   4. If nothing clears the line-edge gate, return the least-bad rung with its
 *      NO_EDGE / INSUFFICIENT_DATA classification.
 *
 * We do NOT fabricate rungs. If only the main line is ingested (the current
 * production reality — the SGO client does not pull alternate spreads), pass a
 * single-rung ladder; `mainLineOnly` is set and the note says so.
 */
export function selectBestRung(
  fairHomeSpread: number | null | undefined,
  ladder: LadderRung[],
  side: BetSide,
  lineEdgeGate: number = LINE_EDGE_GATE,
): LadderSelection {
  const rungs = ladder.filter((r) => Number.isFinite(r.homeSpread))
  if (rungs.length === 0) {
    return {
      best: null,
      evaluated: [],
      mainLineOnly: false,
      note: "No DraftKings spread rungs supplied.",
    }
  }

  const evals = rungs.map((r) =>
    evaluateBet({ fairHomeSpread, offeredHomeSpread: r.homeSpread, price: r.price, side, lineEdgeGate }),
  )

  const rank = (c: BetClassification): number =>
    c === "STRONG_LINE_PRICE_OK" ? 3 : c === "GOOD_LINE_EXPENSIVE" ? 2 : c === "NO_EDGE" ? 1 : 0

  const sorted = [...evals].sort((a, b) => {
    const r = rank(b.classification) - rank(a.classification)
    if (r !== 0) return r
    // Within a class, more line edge is better; break ties with a cheaper price.
    const ea = a.lineEdge ?? Number.NEGATIVE_INFINITY
    const eb = b.lineEdge ?? Number.NEGATIVE_INFINITY
    if (eb !== ea) return eb - ea
    const pa = a.impliedBreakeven ?? Number.POSITIVE_INFINITY
    const pb = b.impliedBreakeven ?? Number.POSITIVE_INFINITY
    return pa - pb
  })

  return {
    best: sorted[0] ?? null,
    evaluated: sorted,
    mainLineOnly: rungs.length === 1,
    note:
      rungs.length === 1
        ? "Only the DraftKings main line is ingested; alternate rungs were not fabricated. Enter alternate spreads/prices to compare."
        : `Evaluated ${rungs.length} DraftKings rungs for the ${side} side.`,
  }
}

/* ---------------------------- Line provenance ----------------------------- */

/**
 * Where a spread + price came from. This is a data-integrity distinction the UI
 * must surface: a verified DraftKings main line (from SportsGameOdds) is NOT the
 * same as a number the user typed off their own bet slip.
 */
export type LineSource = "LIVE_DK" | "USER_ENTERED"

export const LINE_SOURCE_COPY: Record<LineSource, { label: string; long: string }> = {
  LIVE_DK: { label: "LIVE DK", long: "Verified DraftKings line from SportsGameOdds" },
  USER_ENTERED: { label: "USER ENTERED", long: "Manually entered — not verified sportsbook data" },
}

/* -------------------------- Buy-points tradeoff --------------------------- */

/**
 * Max breakeven cost, in percentage points per point of spread bought, that BSE
 * still calls a reasonable tradeoff when the resulting price is not already in
 * the "reasonable" tier. Env-tunable like the price bands; NEVER derived from
 * results. Example: moving a line 2 pts that raises breakeven by 8 points costs
 * 4.0 pts/pt.
 */
export const BUY_POINTS_COST_PER_POINT_MAX = Number(
  process.env.BSE_BUY_POINTS_COST_PER_POINT_MAX ?? 4,
)

export interface PointsPurchaseInput {
  /** Team-facing spread being taken (away = -homeSpread). */
  pickedSpread: number | null
  /** American price for that number. */
  price: number | null
}

export interface PointsPurchaseAssessment {
  /** Extra protection bought, in points (positive = safer number). */
  pointsGained: number | null
  fromBreakeven: number | null
  toBreakeven: number | null
  /** Increase in implied breakeven from the move, in percentage points. */
  breakevenCostPct: number | null
  /** breakevenCostPct per point of protection. */
  costPerPoint: number | null
  toTier: PriceTier
  /** True = the extra protection is worth the added juice; false = too pricey. */
  worthwhile: boolean | null
  verdict: string
}

/**
 * Decide whether moving from one spread/price to another (e.g. buying points off
 * the DK main line to a safer alternate) is worthwhile — WITHOUT any EV or
 * win-probability claim. Pure arithmetic on points of protection and implied
 * breakeven (the win rate the PRICE demands, a definitional identity).
 *
 * Rule (transparent, documented):
 *   - If the move doesn't buy protection (pointsGained <= 0), it isn't a
 *     point-purchase — say so.
 *   - If the safer number is still "reasonable" priced, it's worth it.
 *   - Otherwise, worth it only if breakeven cost per point <= the tunable gate;
 *     above that the juice outweighs the protection → stay at the cheaper line.
 */
export function assessPointsPurchase(
  from: PointsPurchaseInput,
  to: PointsPurchaseInput,
): PointsPurchaseAssessment {
  const fromBreakeven = americanToImpliedProb(from.price)
  const toBreakeven = americanToImpliedProb(to.price)
  const toTier = priceTier(to.price)

  const pointsGained =
    from.pickedSpread != null && to.pickedSpread != null
      ? Math.round((to.pickedSpread - from.pickedSpread) * 100) / 100
      : null

  const breakevenCostPct =
    fromBreakeven != null && toBreakeven != null
      ? Math.round((toBreakeven - fromBreakeven) * 1000) / 10
      : null

  const costPerPoint =
    breakevenCostPct != null && pointsGained != null && pointsGained > 0
      ? Math.round((breakevenCostPct / pointsGained) * 10) / 10
      : null

  let worthwhile: boolean | null
  let verdict: string

  if (pointsGained == null || breakevenCostPct == null) {
    worthwhile = null
    verdict = "Need both a spread and a price on each line to weigh the tradeoff."
  } else if (pointsGained <= 0) {
    worthwhile = false
    verdict =
      pointsGained === 0
        ? "Same number — this only changes the price, not the protection."
        : `This gives up ${Math.abs(pointsGained)} pt of protection, not buys it.`
  } else if (toTier === "reasonable") {
    worthwhile = true
    verdict = `Worth it — ${pointsGained} pt more protection while the price stays reasonable.`
  } else if (costPerPoint != null && costPerPoint <= BUY_POINTS_COST_PER_POINT_MAX) {
    worthwhile = true
    verdict = `Reasonable tradeoff — ${pointsGained} pt of protection costs ${breakevenCostPct} pt of breakeven (${costPerPoint}/pt).`
  } else {
    worthwhile = false
    verdict = `Too expensive — ${breakevenCostPct} pt of added breakeven for ${pointsGained} pt (${costPerPoint ?? "—"}/pt). Stay at the cheaper line.`
  }

  return { pointsGained, fromBreakeven, toBreakeven, breakevenCostPct, costPerPoint, toTier, worthwhile, verdict }
}

/* ------------------------------ Parlay summary ---------------------------- */

export interface ParlayLegLike {
  classification: BetClassification
  lineEdge: number | null
}

export interface ParlaySummary {
  legCount: number
  strong: number
  expensive: number
  noEdge: number
  insufficient: number
  /** Sum of per-leg line edge over legs that have one (points). */
  totalLineEdge: number
  /** Whole-ticket verdict headline. */
  verdict: string
  /** True only when EVERY leg is STRONG_LINE_PRICE_OK. */
  allStrong: boolean
}

/**
 * Summarize a full ticket from its per-leg classifications. Deliberately does
 * NOT compute a parlay win probability or EV (we have no cover-probability
 * calibration), and does NOT approve a ticket just because every leg has line
 * edge — an expensive or no-edge leg is surfaced, not hidden.
 */
export function summarizeParlay(legs: ParlayLegLike[]): ParlaySummary {
  const strong = legs.filter((l) => l.classification === "STRONG_LINE_PRICE_OK").length
  const expensive = legs.filter((l) => l.classification === "GOOD_LINE_EXPENSIVE").length
  const noEdge = legs.filter((l) => l.classification === "NO_EDGE").length
  const insufficient = legs.filter((l) => l.classification === "INSUFFICIENT_DATA").length
  const totalLineEdge = Math.round(
    legs.reduce((s, l) => s + (l.lineEdge ?? 0), 0) * 100,
  ) / 100
  const allStrong = legs.length > 0 && strong === legs.length

  let verdict: string
  if (legs.length === 0) verdict = "Add legs to grade this ticket."
  else if (insufficient > 0) verdict = `${insufficient} leg${insufficient > 1 ? "s" : ""} can't be graded — BSE won't call the ticket.`
  else if (noEdge > 0) verdict = `${noEdge} leg${noEdge > 1 ? "s" : ""} has no BSE edge — the ticket is being dragged down.`
  else if (expensive > 0) verdict = `Every leg beats the fair line, but ${expensive} is priced up — mind the juice.`
  else verdict = "Every leg beats the BSE fair line at an acceptable price."

  return { legCount: legs.length, strong, expensive, noEdge, insufficient, totalLineEdge, verdict, allStrong }
}
