/**
 * BSE BREAKDOWN NARRATIVE — pure prose + itemized-ledger generator.
 * =================================================================
 *
 * Turns the already-assembled, already-audited context read into the two
 * customer-facing written artifacts the Pro breakdown requires:
 *
 *   1. "WHY BSE READS IT THIS WAY" — a concise written analysis per factor,
 *      each carrying exactly one of four statuses:
 *         ADJUSTED · NO MATERIAL IMPACT · ALREADY IN BASE MODEL ·
 *         NOT WIRED / DATA UNAVAILABLE
 *   2. "BSE READ" — a ~150-300 word plain-English summary, dynamically
 *      describing THIS game, plus the itemized Base → Final ledger.
 *
 * HARD GUARANTEES (unchanged from the engine):
 *   - This module is PURE and does NO I/O. It only re-expresses values the
 *     context engine already produced.
 *   - It NEVER invents weather, injuries, travel, or news. Missing data is
 *     surfaced as an explicit status, never a fabricated adjustment.
 *   - It NEVER re-adds anything already inside the frozen model. Factors that
 *     are `in_base` are EXPLAINED (so the customer understands the number) but
 *     always labelled ALREADY IN BASE MODEL and never counted again.
 *   - The read (LEAN / FADE / NO LEAN) is derived from the SAME verdict/edge
 *     the rest of the terminal uses, so prose can never contradict the number.
 */

import { formatSpreadTeam, type ContextRead, type Verdict, type FactorDisposition } from "@/lib/bse/context-engine"
import type { WeatherImpact } from "@/lib/bse/weather-impact"

/* --------------------------------- types -------------------------------- */

export type ReadCode = "LEAN" | "FADE" | "NO_LEAN"

export type FactorStatus = "ADJUSTED" | "NO_MATERIAL_IMPACT" | "IN_BASE" | "NOT_WIRED" | "DATA_UNAVAILABLE"

export const FACTOR_STATUS_LABEL: Record<FactorStatus, string> = {
  ADJUSTED: "ADJUSTED",
  NO_MATERIAL_IMPACT: "NO MATERIAL IMPACT",
  IN_BASE: "ALREADY IN BASE MODEL",
  NOT_WIRED: "NOT WIRED",
  DATA_UNAVAILABLE: "DATA UNAVAILABLE",
}

export interface FactorNarrative {
  key: string
  label: string
  status: FactorStatus
  statusLabel: string
  text: string
}

export interface LedgerLine {
  key: string
  label: string
  points: number
  status: FactorStatus
  statusLabel: string
  detail: string | null
}

export interface BreakdownNarrative {
  read: { code: ReadCode; label: string; team: string | null }
  why: FactorNarrative[]
  bseRead: string
  ledger: {
    baseFairLabel: string
    finalFairLabel: string
    marketLabel: string
    finalEdgePoints: number | null
    finalEdgeLabel: string
    rating: number | null
    readCode: ReadCode
    readLabel: string
    adjustments: LedgerLine[]
  }
}

export interface NarrativeInput {
  homeTeam: string
  awayTeam: string
  neutralSite: boolean
  base: {
    fairHomeSpread: number | null
    edgePoints: number | null
    rating: number | null
    threshold: number
  }
  context: ContextRead
  verdict: Verdict
  marketSpreadHome: number | null
  market: {
    openingSpread: number | null
    currentSpread: number | null
    spreadMovement: number | null
    moveDirection: "toward" | "away" | "none" | null
    moveNarrative: string
  }
  weather: WeatherImpact
  weatherDetail: {
    temperatureF: number | null
    windSpeedMph: number | null
    windGustMph: number | null
    precipitationProbabilityPct: number | null
    humidityPct: number | null
  } | null
}

/* -------------------------------- helpers ------------------------------- */

function abs1(n: number): string {
  return Math.abs(n).toFixed(1)
}

/** Which team a home-relative spread favors, and by how much. */
function favorite(homeRel: number | null, home: string, away: string): { team: string; mag: number } | null {
  if (homeRel == null || !Number.isFinite(homeRel) || homeRel === 0) return null
  return homeRel < 0 ? { team: home, mag: Math.abs(homeRel) } : { team: away, mag: Math.abs(homeRel) }
}

/** Map a context adjustment (points + disposition) to a customer-facing status. */
function statusFromAdjustment(points: number, disposition: FactorDisposition): FactorStatus {
  if (disposition === "data_unavailable") return "DATA_UNAVAILABLE"
  if (disposition === "not_wired") return "NOT_WIRED"
  if (disposition === "in_base") return "IN_BASE"
  // active or totals_only
  if (points !== 0) return "ADJUSTED"
  return "NO_MATERIAL_IMPACT"
}

/**
 * Derive the LEAN / FADE / NO LEAN read from the verdict + market favorite.
 *   - NO LEAN  → verdict does not clear the gate (PASS / insufficient data)
 *   - LEAN     → value is on the market favorite (or a pick'em) — back that side
 *   - FADE     → value is on the underdog — i.e. fade the market favorite
 * This is a relabel of the existing verdict side against the market line sign;
 * it introduces no new number and cannot contradict the edge.
 */
function computeRead(input: NarrativeInput): { code: ReadCode; label: string; team: string | null } {
  const { verdict, marketSpreadHome, context, homeTeam, awayTeam } = input
  if (verdict.code === "PASS" || verdict.code === "INSUFFICIENT" || verdict.side == null) {
    return { code: "NO_LEAN", label: "NO LEAN", team: null }
  }
  const favRef = marketSpreadHome ?? context.finalFairHomeSpread
  const favSide = favRef == null || favRef === 0 ? null : favRef < 0 ? "home" : "away"
  const valueTeam = verdict.valueTeam
  if (favSide == null || verdict.side === favSide) {
    return { code: "LEAN", label: `LEAN ${valueTeam}`, team: valueTeam }
  }
  const favTeam = favSide === "home" ? homeTeam : awayTeam
  return { code: "FADE", label: `FADE ${favTeam} — TAKE ${valueTeam}`, team: valueTeam }
}

/* ----------------------------- why factors ------------------------------ */

function weatherFactor(input: NarrativeInput): FactorNarrative {
  const { weather, weatherDetail } = input
  const base = { key: "weather", label: "Weather" }

  if (weather.status === "indoor") {
    return { ...base, status: "NO_MATERIAL_IMPACT", statusLabel: FACTOR_STATUS_LABEL.NO_MATERIAL_IMPACT, text: "Indoor or domed venue — outdoor conditions are neutralized, so weather is not a factor in this matchup." }
  }
  if (weather.status === "pending_kickoff") {
    return { ...base, status: "DATA_UNAVAILABLE", statusLabel: FACTOR_STATUS_LABEL.DATA_UNAVAILABLE, text: "Kickoff time is not confirmed yet, so a specific game-hour forecast cannot be pulled. No weather input is applied — nothing is assumed." }
  }
  if (weather.status !== "ok") {
    return { ...base, status: "DATA_UNAVAILABLE", statusLabel: FACTOR_STATUS_LABEL.DATA_UNAVAILABLE, text: "No stadium-accurate kickoff forecast is available for this game yet. BSE applies no weather input and does not guess at conditions." }
  }

  // Real forecast present.
  const parts: string[] = []
  if (weatherDetail?.temperatureF != null) parts.push(`${Math.round(weatherDetail.temperatureF)}°F`)
  if (weatherDetail?.windSpeedMph != null) {
    const gust = weatherDetail.windGustMph != null && weatherDetail.windGustMph >= 25 ? `, gusting ${Math.round(weatherDetail.windGustMph)} mph` : ""
    parts.push(`winds ${Math.round(weatherDetail.windSpeedMph)} mph${gust}`)
  }
  if (weatherDetail?.precipitationProbabilityPct != null) parts.push(`${weatherDetail.precipitationProbabilityPct}% precip`)
  const conditions = parts.length ? parts.join(", ") : "measured conditions"

  const text =
    weather.level === "none"
      ? `Game-time conditions (${conditions}) are benign. ${weather.reasoning} Because BSE prices sides — not totals — weather does not move this spread.`
      : `Game-time conditions (${conditions}) register a ${weather.level.toUpperCase()} impact. ${weather.reasoning} That is a scoring/totals effect; BSE models the side only, so it does not adjust the spread here.`
  return { ...base, status: "NO_MATERIAL_IMPACT", statusLabel: FACTOR_STATUS_LABEL.NO_MATERIAL_IMPACT, text }
}

function matchupFactor(input: NarrativeInput): FactorNarrative {
  const fav = favorite(input.base.fairHomeSpread, input.homeTeam, input.awayTeam)
  const text = fav
    ? `The frozen model's talent, Elo, SP+/SRS/FPI, recruiting, returning-production and current-form features (efficiency, success rate, explosiveness, scoring margins) are what price ${fav.team} as roughly a ${fav.mag.toFixed(1)}-point favorite. These drivers EXPLAIN the base number — they are already inside it and are never added a second time.`
    : "The model reads this as a near pick'em: the talent, efficiency, and form features that define the base number offset each other. Those drivers are already inside the number and are not re-applied as adjustments."
  return { key: "matchup", label: "Matchup (Efficiency / Talent / Form)", status: "IN_BASE", statusLabel: FACTOR_STATUS_LABEL.IN_BASE, text }
}

function marketFactor(input: NarrativeInput): FactorNarrative {
  const { market } = input
  const hasMove = market.openingSpread != null && market.currentSpread != null
  const movePart = hasMove
    ? `The line opened ${market.openingSpread!.toFixed(1)} and now sits ${market.currentSpread!.toFixed(1)} (home-relative). ${market.moveNarrative}`
    : "No opening line has been recorded yet, so movement relative to BSE cannot be measured."
  return {
    key: "market",
    label: "Market / Line Movement",
    status: "IN_BASE",
    statusLabel: FACTOR_STATUS_LABEL.IN_BASE,
    text: `The market line is the frozen model's additive anchor, so it is already reflected in the base number. ${movePart} Movement is shown as intelligence only — it is not re-added to the fair spread.`,
  }
}

function venueFactor(input: NarrativeInput): FactorNarrative {
  const text = input.neutralSite
    ? "This is a neutral-site game, and the neutral-site indicator is already a frozen-model feature. No separate home-field value is applied."
    : `${input.homeTeam} hosts. Home-field value is already captured by the frozen model (through the market anchor and its features), so BSE does not add another home-field adjustment on top.`
  return { key: "home_field", label: "Home / Away / Neutral", status: "IN_BASE", statusLabel: FACTOR_STATUS_LABEL.IN_BASE, text }
}

function buildWhy(input: NarrativeInput): FactorNarrative[] {
  return [
    weatherFactor(input),
    { key: "injuries", label: "Injuries / Personnel", status: "DATA_UNAVAILABLE", statusLabel: FACTOR_STATUS_LABEL.DATA_UNAVAILABLE, text: "Injuries and personnel are eligible to move the side, but no injury/roster provider is connected. BSE applies no availability adjustment and never infers a scratch from the absence of data." },
    venueFactor(input),
    { key: "rest", label: "Rest / Schedule", status: "IN_BASE", statusLabel: FACTOR_STATUS_LABEL.IN_BASE, text: "Rest and scheduling (short week, bye, extra rest) are already frozen-model features (rest and games-played differentials). They are reflected in the base number and are not double-counted here." },
    { key: "travel_altitude", label: "Travel / Altitude / Timezone", status: "NOT_WIRED", statusLabel: FACTOR_STATUS_LABEL.NOT_WIRED, text: "No validated travel-distance, altitude, or timezone methodology is wired. Rather than guess at a point value, BSE shows this as NOT WIRED and applies no adjustment." },
    matchupFactor(input),
    marketFactor(input),
    { key: "news", label: "News / Context", status: "DATA_UNAVAILABLE", statusLabel: FACTOR_STATUS_LABEL.DATA_UNAVAILABLE, text: "No reputable news provider is connected, so confirmed developments (coordinator changes, suspensions, scheme news) are not ingested. BSE never invents or infers news." },
  ]
}

/* ------------------------------- BSE READ ------------------------------- */

function buildBseRead(input: NarrativeInput, read: ReadCode): string {
  const { homeTeam, awayTeam, base, context, verdict, marketSpreadHome, market, weather, weatherDetail } = input
  const baseLabel = formatSpreadTeam(base.fairHomeSpread, homeTeam, awayTeam)
  const finalLabel = formatSpreadTeam(context.finalFairHomeSpread, homeTeam, awayTeam)
  const marketLabel = formatSpreadTeam(marketSpreadHome, homeTeam, awayTeam)
  const s: string[] = []

  if (verdict.code === "INSUFFICIENT") {
    return `BSE needs both a frozen model number and a current market line to assert a read on ${awayTeam} at ${homeTeam}, and one of those is not yet available. Until both are in hand, BSE publishes no side and estimates nothing — the breakdown will fill in automatically once the missing input arrives.`
  }

  // 1) The number.
  const net = context.netAdjustmentPoints
  if (net === 0) {
    s.push(`BSE's frozen model prices this game at ${baseLabel}, and after context the final BSE number is unchanged at ${finalLabel} against a market of ${marketLabel}.`)
  } else {
    s.push(`BSE's frozen model opens at ${baseLabel}; after ${net > 0 ? "+" : ""}${net.toFixed(1)} points of documented context the final BSE number is ${finalLabel}, against a market of ${marketLabel}.`)
  }

  // 2) Matchup drivers (already in base).
  const fav = favorite(base.fairHomeSpread, homeTeam, awayTeam)
  if (fav) {
    s.push(`${fav.team}'s underlying efficiency, talent and form profile is why the base model makes them roughly a ${fav.mag.toFixed(1)}-point favorite — but those factors are already incorporated into the fair spread and are not additional adjustments.`)
  } else {
    s.push(`The model sees the two sides as evenly matched on talent and efficiency, and those drivers are already inside the fair spread rather than layered on top.`)
  }

  // 3) Weather (dynamic, honest).
  if (weather.status === "ok") {
    const wind = weatherDetail?.windSpeedMph != null ? `${Math.round(weatherDetail.windSpeedMph)} mph winds` : "measured winds"
    const precip = weatherDetail?.precipitationProbabilityPct != null ? `${weatherDetail.precipitationProbabilityPct}% precipitation` : "an unknown precipitation chance"
    const materiality = weather.level === "none" ? "not material" : "material to scoring but not to the side"
    s.push(`Game-time weather shows ${wind} and ${precip}; BSE considers that ${materiality} because weather suppresses totals, not the spread.`)
  } else if (weather.status === "indoor") {
    s.push(`The game is indoors, so weather is neutralized and plays no part in the read.`)
  } else {
    s.push(`A stadium forecast is not available yet, so no weather input is applied and nothing about conditions is assumed.`)
  }

  // 4) Personnel — always honest about the missing feed.
  s.push(`No injury or personnel feed is connected, so BSE applies no availability adjustment and infers nothing from the absence of news.`)

  // 5) Market movement.
  if (market.openingSpread != null && market.currentSpread != null) {
    const dir = market.moveDirection === "toward" ? "toward BSE's number" : market.moveDirection === "away" ? "away from BSE's number" : "very little"
    s.push(`The market opened ${market.openingSpread.toFixed(1)} and currently sits ${market.currentSpread.toFixed(1)} (home-relative), moving ${dir}.`)
  }

  // 6) Conclusion tied to the gate.
  const edge = verdict.edgePoints
  if (read === "NO_LEAN") {
    const gap = edge != null ? `${abs1(edge)}-point` : "sub-threshold"
    s.push(`After incorporating ONLY validated information the frozen model does not already capture, the final BSE edge is a ${gap} separation — below the ${base.threshold.toFixed(1)}-point threshold — so BSE has NO LEAN at the current number.`)
  } else {
    const verb = read === "FADE" ? "fades the favorite and leans" : "leans"
    s.push(`After incorporating ONLY validated information the frozen model does not already capture, the final BSE edge is ${edge != null ? abs1(edge) : "—"} points on ${verdict.valueTeam}, which clears the ${base.threshold.toFixed(1)}-point threshold — so BSE ${verb} ${verdict.valueTeam} at the current number.`)
  }

  return s.join(" ")
}

/* -------------------------------- ledger -------------------------------- */

function buildLedger(input: NarrativeInput, read: { code: ReadCode; label: string }): BreakdownNarrative["ledger"] {
  const { homeTeam, awayTeam, base, context, verdict, marketSpreadHome } = input
  const adjustments: LedgerLine[] = context.adjustments.map((a) => {
    const status = statusFromAdjustment(a.points, a.disposition)
    return { key: a.key, label: a.label, points: a.points, status, statusLabel: FACTOR_STATUS_LABEL[status], detail: a.detail }
  })
  const edge = verdict.edgePoints
  const finalEdgeLabel =
    edge == null ? "—" : verdict.valueTeam ? `${abs1(edge)} pt on ${verdict.valueTeam}` : `${abs1(edge)} pt (no qualifying side)`
  return {
    baseFairLabel: formatSpreadTeam(context.baseFairHomeSpread, homeTeam, awayTeam),
    finalFairLabel: formatSpreadTeam(context.finalFairHomeSpread, homeTeam, awayTeam),
    marketLabel: formatSpreadTeam(marketSpreadHome, homeTeam, awayTeam),
    finalEdgePoints: edge,
    finalEdgeLabel,
    rating: base.rating,
    readCode: read.code,
    readLabel: read.label,
    adjustments,
  }
}

/* -------------------------------- public -------------------------------- */

/** Build the full narrative (why + BSE READ prose + itemized ledger). Pure. */
export function buildNarrative(input: NarrativeInput): BreakdownNarrative {
  const read = computeRead(input)
  return {
    read,
    why: buildWhy(input),
    bseRead: buildBseRead(input, read.code),
    ledger: buildLedger(input, read),
  }
}
