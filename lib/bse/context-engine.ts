/**
 * BSE CONTEXT ENGINE — separate, auditable layer on top of the frozen model.
 * =========================================================================
 *
 * The frozen model produces ONE number: the Base BSE Fair Spread (home-relative).
 * This engine NEVER retrains, mutates, or re-derives that number. It only:
 *
 *   FINAL BSE Fair Spread = Base Fair Spread + Σ (documented context adjustments)
 *
 * and every adjustment is transparent, bounded, and comes from data the frozen
 * snapshot does NOT already contain.
 *
 * DOUBLE-COUNTING GUARD (the most important rule):
 *   The frozen candidate `B_residual::gbt` already trains on 17 features —
 *   Elo, talent, SP+/SRS/FPI, recruiting, returning production, off/def
 *   efficiency (PPA), success rate, explosiveness, scoring margins, points
 *   for/against, REST, games played — plus a neutral-site indicator, and it
 *   uses the market line as an additive anchor. Every one of those is therefore
 *   ALREADY PRICED INTO THE BASE NUMBER and is display-only here — it can never
 *   be re-added as an adjustment. Only factors the base number cannot know
 *   (weather now, injuries/news now) are adjustment-eligible.
 *
 * HONEST REALITY (see CONTEXT_FACTORS):
 *   - Weather: real data, but it is a TOTALS effect and we model no totals →
 *     0.0 spread adjustment, documented (see weather-impact.ts).
 *   - Injuries / news: adjustment-eligible in principle, but NO data provider is
 *     wired → 0.0, reported as DATA CURRENTLY UNAVAILABLE. Never inferred.
 *   So today FINAL == BASE for every game, with every factor showing exactly why
 *   it did or did not move the number. The moment an injury/news feed is added,
 *   this same engine emits real non-zero adjustments — no model change required.
 *
 * PURE + VERSIONED: no I/O here. Because the engine is deterministic and
 * CONTEXT_ENGINE_VERSION-stamped, and every input (frozen edge, odds snapshot,
 * weather row) is already persisted with timestamps, any read is fully
 * reconstructable for audit without a new table.
 */

import { LINE_EDGE_GATE, priceTier, type PriceTier } from "./price-aware"
import type { WeatherImpact } from "./weather-impact"

export const CONTEXT_ENGINE_VERSION = "ctx-v1"

/* ------------------------------------------------------------------ */
/* Factor map — the explicit double-counting ledger the UI renders.    */
/* ------------------------------------------------------------------ */

export type FactorDisposition =
  | "active" // eligible + data present → can move the number
  | "data_unavailable" // eligible but no provider wired → 0, honest empty state
  | "in_base" // already inside the frozen model → display-only, never re-added
  | "totals_only" // real effect, but on totals which BSE does not model → 0
  | "not_wired" // eligible in principle, no reliable input/methodology yet → 0

export interface ContextFactor {
  key: string
  label: string
  /** Is this signal already represented inside the frozen base model? */
  inBaseModel: boolean
  /** May it legitimately adjust the FINAL fair spread? */
  contextEligible: boolean
  disposition: FactorDisposition
  /** How it is handled (the "adjustment method" column). */
  method: string
}

/**
 * The authoritative factor → base? → eligible? → method map. Exported so the
 * breakdown can show customers exactly why each input does or does not move the
 * BSE number (no hidden logic).
 */
export const CONTEXT_FACTORS: ContextFactor[] = [
  {
    key: "weather",
    label: "Weather",
    inBaseModel: false,
    contextEligible: true,
    disposition: "totals_only",
    method:
      "Real kickoff-hour stadium forecast → Impact level. Suppresses scoring (a totals effect); no side adjustment without validated offensive-style asymmetry data.",
  },
  {
    key: "injuries",
    label: "Injuries / Personnel",
    inBaseModel: false,
    contextEligible: true,
    disposition: "data_unavailable",
    method: "Eligible to move the side, but no injury/roster provider is connected. Reported unavailable; never inferred.",
  },
  {
    key: "news",
    label: "News / Context",
    inBaseModel: false,
    contextEligible: true,
    disposition: "data_unavailable",
    method: "Eligible for confirmed football developments, but no reputable news provider is connected. Reported unavailable.",
  },
  {
    key: "rest",
    label: "Rest / Short Week / Bye",
    inBaseModel: true,
    contextEligible: false,
    disposition: "in_base",
    method: "Already a model feature (rest_diff, games_played_diff). Re-adjusting would double count.",
  },
  {
    key: "home_field",
    label: "Home Field / Neutral Site",
    inBaseModel: true,
    contextEligible: false,
    disposition: "in_base",
    method: "Already captured (neutral_site feature + the market line anchor). Re-adjusting would double count.",
  },
  {
    key: "travel_altitude",
    label: "Travel / Altitude / Timezone",
    inBaseModel: false,
    contextEligible: true,
    disposition: "not_wired",
    method: "No team-home-venue travel mapping or validated altitude methodology is wired. Not adjusted rather than guessed.",
  },
  {
    key: "team_strength",
    label: "Talent / Elo / SP+ / Recruiting / Returning Production",
    inBaseModel: true,
    contextEligible: false,
    disposition: "in_base",
    method: "Core frozen-model features. Displayed as 'already priced in'; never re-added.",
  },
  {
    key: "form_efficiency",
    label: "Efficiency / Success Rate / Explosiveness / Scoring Form",
    inBaseModel: true,
    contextEligible: false,
    disposition: "in_base",
    method: "Frozen-model form features (PPA, success, explosiveness, margins, points for/against). Never re-added.",
  },
  {
    key: "market",
    label: "Market Line / Movement",
    inBaseModel: true,
    contextEligible: false,
    disposition: "in_base",
    method: "The market line is the model's additive anchor. Movement is shown as intelligence, not re-added to the fair spread.",
  },
]

/* ------------------------------------------------------------------ */
/* Adjustment ledger: Base → Final.                                    */
/* ------------------------------------------------------------------ */

export interface ContextAdjustment {
  key: string
  label: string
  /** Signed points applied to the home-relative fair spread (negative = toward home). */
  points: number
  disposition: FactorDisposition
  /** Team-facing summary of the adjustment direction, or null when 0/none. */
  detail: string | null
}

export interface ContextRead {
  engineVersion: string
  baseFairHomeSpread: number | null
  adjustments: ContextAdjustment[]
  finalFairHomeSpread: number | null
  netAdjustmentPoints: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Assemble the Base → Final ledger. Only adjustment-eligible, data-present
 * factors can carry non-zero points; everything else is recorded at 0 with its
 * honest disposition so the customer sees the full accounting.
 */
export function assembleContextRead(args: {
  baseFairHomeSpread: number | null
  weather: WeatherImpact | null
}): ContextRead {
  const { baseFairHomeSpread, weather } = args
  const adjustments: ContextAdjustment[] = []

  // Weather (totals effect → 0 by design).
  if (weather) {
    adjustments.push({
      key: "weather",
      label: "Weather",
      points: weather.spreadAdjustment,
      disposition: weather.status === "ok" || weather.status === "indoor" ? "totals_only" : "data_unavailable",
      detail:
        weather.status === "ok"
          ? `Impact ${weather.level.toUpperCase()} — totals-side only`
          : weather.status === "indoor"
            ? "Indoor — neutralized"
            : "No forecast available",
    })
  }

  // Injuries / news — eligible but unprovided.
  adjustments.push({
    key: "injuries",
    label: "Injuries / Personnel",
    points: 0,
    disposition: "data_unavailable",
    detail: "No provider connected",
  })
  adjustments.push({
    key: "news",
    label: "News / Context",
    points: 0,
    disposition: "data_unavailable",
    detail: "No provider connected",
  })

  const net = round1(adjustments.reduce((s, a) => s + (Number.isFinite(a.points) ? a.points : 0), 0))
  const final =
    baseFairHomeSpread == null || !Number.isFinite(baseFairHomeSpread) ? null : round1(baseFairHomeSpread + net)

  return {
    engineVersion: CONTEXT_ENGINE_VERSION,
    baseFairHomeSpread: baseFairHomeSpread == null ? null : round1(baseFairHomeSpread),
    adjustments,
    finalFairHomeSpread: final,
    netAdjustmentPoints: net,
  }
}

/* ------------------------------------------------------------------ */
/* Formatting helper (team-anchored spread).                           */
/* ------------------------------------------------------------------ */

/** Format a home-relative spread as a team-anchored string, e.g. "LSU -10.2". */
export function formatSpreadTeam(homeRelative: number | null, homeTeam: string, awayTeam: string): string {
  if (homeRelative == null || !Number.isFinite(homeRelative)) return "—"
  if (homeRelative === 0) return "Pick'em"
  return homeRelative < 0
    ? `${homeTeam} ${round1(homeRelative).toFixed(1)}`
    : `${awayTeam} ${round1(-homeRelative).toFixed(1)}`
}

/* ------------------------------------------------------------------ */
/* Verdict.                                                            */
/* ------------------------------------------------------------------ */

export type VerdictCode = "PASS" | "LEAN" | "STRONG" | "ELITE" | "INSUFFICIENT"
export type VerdictTone = "pass" | "lean" | "strong" | "neutral"

export interface Verdict {
  code: VerdictCode
  tone: VerdictTone
  headline: string
  explanation: string
  /** Value side at the current number, when one is asserted. */
  side: "home" | "away" | null
  valueTeam: string | null
  /** Points of value vs the FINAL fair spread at the current market number. */
  edgePoints: number | null
}

/** Tier the magnitude of value into the customer-facing verdict codes. */
function tierFromEdge(absEdge: number): Exclude<VerdictCode, "PASS" | "INSUFFICIENT"> {
  if (absEdge >= 3.5) return "ELITE"
  if (absEdge >= 2) return "STRONG"
  return "LEAN"
}

/**
 * Generate the BSE verdict from the FINAL fair spread vs the current market
 * line. Tiering is on points of value (line edge); price only adds a juice
 * caveat. Never asserts a side inside the |edge| < gate agreement zone.
 */
export function computeVerdict(args: {
  finalFairHomeSpread: number | null
  marketSpreadHome: number | null
  homeTeam: string
  awayTeam: string
  /** American price for the value side at the main line, when known. */
  valueSidePrice?: number | null
  gate?: number
}): Verdict {
  const gate = args.gate ?? LINE_EDGE_GATE
  const { finalFairHomeSpread, marketSpreadHome, homeTeam, awayTeam } = args

  if (finalFairHomeSpread == null || marketSpreadHome == null) {
    return {
      code: "INSUFFICIENT",
      tone: "neutral",
      headline: "AWAITING DATA",
      explanation:
        "BSE needs both a frozen model number and a current market line to assert a read on this game. One or both is not yet available.",
      side: null,
      valueTeam: null,
      edgePoints: null,
    }
  }

  // edge(home) = market - fair. Positive → home is the value side.
  const edge = round1(marketSpreadHome - finalFairHomeSpread)
  const absEdge = Math.abs(edge)
  const marketLabel = formatSpreadTeam(marketSpreadHome, homeTeam, awayTeam)
  const fairLabel = formatSpreadTeam(finalFairHomeSpread, homeTeam, awayTeam)

  if (absEdge < gate) {
    return {
      code: "PASS",
      tone: "pass",
      headline: "PASS — MARKET & BSE AGREE",
      explanation: `BSE makes it ${fairLabel} and the market is ${marketLabel}. The ${absEdge.toFixed(
        1,
      )}-point separation does not clear BSE's ${gate.toFixed(
        1,
      )}-point tracking threshold, so BSE is not asserting a side at the current number.`,
      side: null,
      valueTeam: null,
      edgePoints: edge,
    }
  }

  const side: "home" | "away" = edge > 0 ? "home" : "away"
  const valueTeam = side === "home" ? homeTeam : awayTeam
  const code = tierFromEdge(absEdge)
  const tone: VerdictTone = code === "LEAN" ? "lean" : "strong"

  // The value side takes the current market number for that side.
  const valueSideLine =
    side === "home" ? formatSpreadTeam(marketSpreadHome, homeTeam, awayTeam) : formatSpreadTeam(marketSpreadHome, homeTeam, awayTeam)

  const tier = args.valueSidePrice != null ? priceTier(args.valueSidePrice) : ("unknown" as PriceTier)
  const juice =
    tier === "prohibitive"
      ? " The posted price is expensive, which eats into the edge — mind the juice."
      : tier === "expensive"
        ? " Note the price is on the expensive side."
        : ""

  const headline =
    code === "ELITE"
      ? `STRONG BSE EDGE — ${valueTeam}`
      : code === "STRONG"
        ? `BSE EDGE — ${valueTeam}`
        : `LEAN ${valueSideLine}`

  return {
    code,
    tone,
    headline,
    explanation: `BSE makes it ${fairLabel} versus the market's ${marketLabel}, roughly ${absEdge.toFixed(
      1,
    )} points of value on ${valueTeam}. That clears the ${gate.toFixed(1)}-point threshold, so BSE leans ${valueTeam} at the current number.${juice}`,
    side,
    valueTeam,
    edgePoints: edge,
  }
}

/* ------------------------------------------------------------------ */
/* Verdict-consistent read strength (breakdown-local; board unchanged).*/
/* ------------------------------------------------------------------ */

export type StrengthBand = "pass" | "lean" | "strong" | "elite"

export interface ReadStrength {
  /** Raw 0-100 edge-scaled signal from the frozen model (unchanged math). */
  rawScore: number | null
  band: StrengthBand
  label: string
  /** One-line meaning, always consistent with the verdict. */
  meaning: string
}

const BAND_META: Record<StrengthBand, { label: string; meaning: string }> = {
  pass: { label: "PASS / NO EDGE", meaning: "Inside the agreement zone — BSE is not asserting a side." },
  lean: { label: "LEAN", meaning: "Clears the tracking threshold — a directional lean, not a lock." },
  strong: { label: "STRONG EDGE", meaning: "A sizable gap between BSE and the market." },
  elite: { label: "ELITE EDGE", meaning: "A rare, large separation from the market number." },
}

/**
 * Map the SAME edge used by the verdict into a strength band, so the number a
 * customer sees can never contradict the verdict. Uses identical thresholds to
 * computeVerdict (gate / 2 / 3.5). rawScore is the frozen model's existing
 * 0-100 rating, passed through untouched for continuity.
 */
export function readStrength(edgePoints: number | null, rawScore: number | null, gate: number = LINE_EDGE_GATE): ReadStrength {
  if (edgePoints == null) {
    return { rawScore, band: "pass", label: BAND_META.pass.label, meaning: BAND_META.pass.meaning }
  }
  const abs = Math.abs(edgePoints)
  const band: StrengthBand = abs < gate ? "pass" : abs >= 3.5 ? "elite" : abs >= 2 ? "strong" : "lean"
  return { rawScore, band, label: BAND_META[band].label, meaning: BAND_META[band].meaning }
}

/* ------------------------------------------------------------------ */
/* Value thresholds ("value starts at").                               */
/* ------------------------------------------------------------------ */

export interface ValueThreshold {
  /** Home-relative spread at which this side begins to clear the gate. */
  homeRelative: number
  /** Team-facing label, e.g. "Clemson +11.2". */
  label: string
}

export interface ValueThresholds {
  home: ValueThreshold
  away: ValueThreshold
  gate: number
}

/**
 * The market numbers at which each side begins to offer BSE line value, i.e.
 * where |line edge| reaches the gate versus the FINAL fair spread. Pure
 * arithmetic; price still matters separately (shown in the Alternate Lab).
 */
export function valueThresholds(
  finalFairHomeSpread: number | null,
  homeTeam: string,
  awayTeam: string,
  gate: number = LINE_EDGE_GATE,
): ValueThresholds | null {
  if (finalFairHomeSpread == null || !Number.isFinite(finalFairHomeSpread)) return null
  const homeRel = round1(finalFairHomeSpread + gate) // home value: offered home spread >= fair + gate
  const awayRel = round1(finalFairHomeSpread - gate) // away value: offered home spread <= fair - gate
  return {
    home: { homeRelative: homeRel, label: formatSpreadTeam(homeRel, homeTeam, awayTeam) },
    away: { homeRelative: awayRel, label: formatSpreadTeam(awayRel, homeTeam, awayTeam) },
    gate,
  }
}

/* ------------------------------------------------------------------ */
/* What could change the read.                                         */
/* ------------------------------------------------------------------ */

export interface ChangeTrigger {
  text: string
  /** true = backed by wired data; false = honest note about an unwired input. */
  dataBacked: boolean
}

/**
 * Data-driven list of the variables most likely to flip or strengthen the read.
 * Only emits line/weather triggers that are computable from wired data, plus an
 * explicit honest note about the currently-unwired personnel/news inputs.
 */
export function whatCouldChange(args: {
  verdict: Verdict
  thresholds: ValueThresholds | null
  weather: WeatherImpact | null
}): ChangeTrigger[] {
  const out: ChangeTrigger[] = []
  const { verdict, thresholds, weather } = args

  if (thresholds) {
    if (verdict.code === "PASS") {
      out.push({ text: `If the market reaches ${thresholds.home.label} or better, BSE flips to a lean on the home side.`, dataBacked: true })
      out.push({ text: `If the market reaches ${thresholds.away.label} or better, BSE flips to a lean on the away side.`, dataBacked: true })
    } else if (verdict.side === "home") {
      out.push({ text: `The lean holds while the home number stays at or better than ${thresholds.home.label}; past that the value is gone.`, dataBacked: true })
    } else if (verdict.side === "away") {
      out.push({ text: `The lean holds while the away number stays at or better than ${thresholds.away.label}; past that the value is gone.`, dataBacked: true })
    }
  }

  if (weather?.hasForecast) {
    if (weather.level === "none" || weather.level === "low") {
      out.push({ text: "If sustained winds climb past ~20 mph or steady precipitation sets in, weather impact escalates (a totals-side effect).", dataBacked: true })
    } else {
      out.push({ text: "If conditions ease before kickoff, the weather impact downgrades — track the latest forecast refresh.", dataBacked: true })
    }
  }

  out.push({
    text: "A confirmed starting-QB ruling, suspension, or major OL absence would change the read — but injuries/personnel are not currently tracked (no data provider connected).",
    dataBacked: false,
  })

  return out
}
