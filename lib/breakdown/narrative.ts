/**
 * BSE BREAKDOWN NARRATIVE — plain-English prose + itemized-ledger generator.
 * ==========================================================================
 *
 * Turns the already-assembled, already-audited context read into the
 * customer-facing written artifacts the Pro breakdown requires:
 *
 *   1. HUMAN VERDICT  — a plain-English headline ("BSE likes LSU") + one-line
 *      reason, derived from the SAME verdict/edge the terminal uses.
 *   2. BSE READ       — a story-structured, ~150-300 word plain-English summary
 *      (what BSE thinks → why → what could go wrong → price → verdict),
 *      dynamically describing THIS game, with light, sparing personality.
 *   3. KEY FACTORS    — a short list of the handful of things that actually
 *      drive this read (matchup, price, weather-if-material, movement, the
 *      honest injuries caveat).
 *   4. WHY (factor prose) + itemized Base → Final ledger for the Deep Dive.
 *
 * HARD GUARANTEES (unchanged from the engine):
 *   - PURE, no I/O. It only re-expresses values the context engine produced.
 *   - It NEVER invents weather, injuries, travel, or news. Missing data is
 *     surfaced as an explicit status, never a fabricated adjustment.
 *   - It NEVER re-adds anything already inside the frozen model. `in_base`
 *     factors are EXPLAINED (in plain English) but never counted again.
 *   - The read/verdict is derived from the SAME edge the rest of the terminal
 *     uses, so prose can never contradict the number.
 *   - Personality is deterministic per game (see voice.ts) and is flavor only —
 *     it cannot change a fact, a side, or a conclusion.
 */

import { formatSpreadTeam, type ContextRead, type Verdict, type FactorDisposition } from "@/lib/bse/context-engine"
import type { WeatherImpact } from "@/lib/bse/weather-impact"
import { seedFrom, voiceLine, gate } from "@/lib/breakdown/voice"

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

/** Plain-English, human verdict shown at the top of the breakdown. */
export interface HumanVerdict {
  headline: string
  plain: string
  tone: "like" | "lean" | "pass" | "neutral"
  /** Secondary chips, e.g. "WEATHER WARNING". Never a betting instruction. */
  flags: string[]
}

/** One concise, decision-relevant factor for the KEY FACTORS list. */
export interface KeyFactor {
  key: string
  label: string
  text: string
  tone: "pro" | "con" | "neutral"
}

export interface BreakdownNarrative {
  read: { code: ReadCode; label: string; team: string | null }
  verdict: HumanVerdict
  keyFactors: KeyFactor[]
  why: FactorNarrative[]
  /** Story-structured plain-English read. Paragraphs are separated by "\n\n". */
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

/** True when weather is a real forecast that is actually material to scoring. */
function weatherIsMaterial(w: WeatherImpact): boolean {
  return w.status === "ok" && (w.level === "moderate" || w.level === "high")
}

/** True when the market has moved a meaningful amount (>= ~1.5 pts). */
function meaningfulMove(input: NarrativeInput): boolean {
  const mv = input.market.spreadMovement
  return mv != null && Math.abs(mv) >= 1.5
}

/** A per-game seed so personality varies by game but is stable for a game. */
function gameSeed(input: NarrativeInput): number {
  const b = input.base.fairHomeSpread ?? 0
  const m = input.marketSpreadHome ?? 0
  return seedFrom(`${input.homeTeam}|${input.awayTeam}|${b.toFixed(1)}|${m.toFixed(1)}`)
}

/** Map a context adjustment (points + disposition) to a customer-facing status. */
function statusFromAdjustment(points: number, disposition: FactorDisposition): FactorStatus {
  if (disposition === "data_unavailable") return "DATA_UNAVAILABLE"
  if (disposition === "not_wired") return "NOT_WIRED"
  if (disposition === "in_base") return "IN_BASE"
  if (points !== 0) return "ADJUSTED"
  return "NO_MATERIAL_IMPACT"
}

/**
 * Derive the LEAN / FADE / NO LEAN read from the verdict + market favorite.
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

/* ------------------------------ human verdict --------------------------- */

function buildHumanVerdict(input: NarrativeInput, read: ReadCode): HumanVerdict {
  const { homeTeam, awayTeam, base, context, verdict, marketSpreadHome } = input
  const seed = gameSeed(input)
  const flags: string[] = []
  if (weatherIsMaterial(input.weather)) {
    flags.push(input.weather.level === "high" ? "WEATHER WARNING" : "WEATHER: MODERATE")
  }

  if (verdict.code === "INSUFFICIENT") {
    return {
      headline: "AWAITING DATA",
      plain: "BSE needs both its model number and a live market line before it will call a side. One of them isn't in yet.",
      tone: "neutral",
      flags,
    }
  }

  const finalLabel = formatSpreadTeam(context.finalFairHomeSpread, homeTeam, awayTeam)
  const marketLabel = formatSpreadTeam(marketSpreadHome, homeTeam, awayTeam)
  const edge = verdict.edgePoints

  // A side is asserted → "BSE likes / leans {team}".
  if ((read === "LEAN" || read === "FADE") && verdict.valueTeam) {
    const team = verdict.valueTeam
    const strong = edge != null && Math.abs(edge) >= 2
    const headline = strong ? `BSE LIKES ${team.toUpperCase()}` : `BSE LEANS ${team.toUpperCase()}`
    const edgeStr = edge != null ? abs1(edge) : "—"
    const flavor = gate(seed, 2) ? ` ${voiceLine(seed, strong ? "strongEdge" : "smallEdge")}` : ""
    return {
      headline,
      plain: `BSE makes it ${finalLabel} against a market of ${marketLabel} — about ${edgeStr} points of value on ${team}.${flavor}`,
      tone: strong ? "like" : "lean",
      flags,
    }
  }

  // No side. Distinguish "good team, bad price" from a genuine agreement.
  const fav = favorite(context.finalFairHomeSpread, homeTeam, awayTeam)
  const goodTeamBadPrice = fav != null && fav.mag >= 3
  const caughtUp = input.market.moveDirection === "toward" && meaningfulMove(input)

  if (caughtUp) {
    return {
      headline: "PASS — MARKET MOVED PAST US",
      plain: `BSE makes it ${finalLabel} and the market has moved to ${marketLabel}. ${voiceLine(seed, "marketCaughtUp")}`,
      tone: "pass",
      flags,
    }
  }
  if (goodTeamBadPrice) {
    return {
      headline: "PASS — GOOD TEAM, BAD PRICE",
      plain: `BSE's number is ${finalLabel}, but at ${marketLabel} the value is gone. ${voiceLine(seed, "goodTeamBadPrice")}`,
      tone: "pass",
      flags,
    }
  }
  return {
    headline: "PASS — BSE & THE MARKET AGREE",
    plain: `BSE makes it ${finalLabel} and the market is ${marketLabel}. ${voiceLine(seed, "agreement")}`,
    tone: "pass",
    flags,
  }
}

/* ------------------------------ key factors ----------------------------- */

function buildKeyFactors(input: NarrativeInput): KeyFactor[] {
  const { homeTeam, awayTeam, base, context, verdict, marketSpreadHome, weather } = input
  const out: KeyFactor[] = []
  const marketLabel = formatSpreadTeam(marketSpreadHome, homeTeam, awayTeam)

  // 1) Matchup — the base number's drivers (always relevant).
  const fav = favorite(base.fairHomeSpread, homeTeam, awayTeam)
  out.push({
    key: "matchup",
    label: "Matchup",
    tone: "pro",
    text: fav
      ? `${fav.team} grades out ahead — efficiency, talent and recent form all tilt their way, and that's already the reason for the number.`
      : "The model sees two evenly matched teams; talent and efficiency roughly cancel out.",
  })

  // 2) Price / value at the current number.
  if (marketSpreadHome != null && context.finalFairHomeSpread != null) {
    const edge = verdict.edgePoints
    if (verdict.side && verdict.valueTeam && edge != null) {
      out.push({
        key: "price",
        label: "Price",
        tone: "pro",
        text: `At ${marketLabel}, BSE's number gives about ${abs1(edge)} points of value on ${verdict.valueTeam}.`,
      })
    } else {
      out.push({
        key: "price",
        label: "Price",
        tone: "con",
        text: `At ${marketLabel} the market is right on top of BSE's number — no meaningful line value.`,
      })
    }
  }

  // 3) Weather — only when it is a real, material forecast.
  if (weatherIsMaterial(weather)) {
    out.push({
      key: "weather",
      label: "Weather",
      tone: "con",
      text: `${weather.level.toUpperCase()} impact — it drags on scoring, not the side, so it hits the total but not the spread.`,
    })
  }

  // 4) Line movement — only when it actually moved.
  if (meaningfulMove(input) && input.market.openingSpread != null && input.market.currentSpread != null) {
    const dir =
      input.market.moveDirection === "toward"
        ? "toward BSE"
        : input.market.moveDirection === "away"
          ? "away from BSE"
          : "sideways"
    out.push({
      key: "movement",
      label: "Line move",
      tone: "neutral",
      text: `The line moved from ${input.market.openingSpread.toFixed(1)} to ${input.market.currentSpread.toFixed(
        1,
      )} (home-relative), ${dir}.`,
    })
  }

  // 5) Injuries — always the honest caveat (straight, never a joke).
  out.push({
    key: "injuries",
    label: "Injuries",
    tone: "con",
    text: "Injuries and personnel aren't tracked yet — a late scratch or QB change would not be in this read.",
  })

  return out.slice(0, 5)
}

/* ----------------------------- why factors ------------------------------ */

function weatherFactor(input: NarrativeInput): FactorNarrative {
  const { weather, weatherDetail } = input
  const base = { key: "weather", label: "Weather" }

  if (weather.status === "indoor") {
    return { ...base, status: "NO_MATERIAL_IMPACT", statusLabel: FACTOR_STATUS_LABEL.NO_MATERIAL_IMPACT, text: "It's indoors, so weather is off the table entirely — no wind, no rain, no effect." }
  }
  if (weather.status === "pending_kickoff") {
    return { ...base, status: "DATA_UNAVAILABLE", statusLabel: FACTOR_STATUS_LABEL.DATA_UNAVAILABLE, text: "Kickoff time isn't locked yet, so we can't pull an accurate game-hour forecast. BSE applies nothing and assumes nothing." }
  }
  if (weather.status !== "ok") {
    return { ...base, status: "DATA_UNAVAILABLE", statusLabel: FACTOR_STATUS_LABEL.DATA_UNAVAILABLE, text: "We don't have a stadium forecast for this game yet, so BSE isn't making a weather call — and it will never guess at clear skies just because data is missing." }
  }

  const parts: string[] = []
  if (weatherDetail?.temperatureF != null) parts.push(`${Math.round(weatherDetail.temperatureF)}°F`)
  if (weatherDetail?.windSpeedMph != null) {
    const gust = weatherDetail.windGustMph != null && weatherDetail.windGustMph >= 25 ? `, gusting ${Math.round(weatherDetail.windGustMph)} mph` : ""
    parts.push(`winds ${Math.round(weatherDetail.windSpeedMph)} mph${gust}`)
  }
  if (weatherDetail?.precipitationProbabilityPct != null) parts.push(`${weatherDetail.precipitationProbabilityPct}% chance of precip`)
  const conditions = parts.length ? parts.join(", ") : "the measured conditions"

  const text =
    weather.level === "none"
      ? `Game-time conditions (${conditions}) are calm, so weather doesn't factor in. And since bad weather mostly hurts scoring rather than one team, it wouldn't move the spread anyway.`
      : `Game-time conditions (${conditions}) rate a ${weather.level.toUpperCase()} impact. That mainly hurts kicking, deep passing and ball security — a scoring effect. BSE prices the side, not the total, so it doesn't nudge the spread unless one team is clearly more weather-dependent, and we don't have that evidence here.`
  return { ...base, status: "NO_MATERIAL_IMPACT", statusLabel: FACTOR_STATUS_LABEL.NO_MATERIAL_IMPACT, text }
}

function matchupFactor(input: NarrativeInput): FactorNarrative {
  const fav = favorite(input.base.fairHomeSpread, input.homeTeam, input.awayTeam)
  const text = fav
    ? `Talent, efficiency, recent form, recruiting and returning production all point to ${fav.team}, which is why BSE makes them about a ${fav.mag.toFixed(1)}-point favorite. Here's the key part: BSE already used all of that to build the number, so we explain it but never count it a second time.`
    : "This looks like a near pick'em — the talent and efficiency of both teams roughly cancel out. Those factors are already inside the number, not added on top of it."
  return { key: "matchup", label: "Matchup (Efficiency / Talent / Form)", status: "IN_BASE", statusLabel: FACTOR_STATUS_LABEL.IN_BASE, text }
}

function marketFactor(input: NarrativeInput): FactorNarrative {
  const { market } = input
  const hasMove = market.openingSpread != null && market.currentSpread != null
  const movePart = hasMove
    ? `It opened ${market.openingSpread!.toFixed(1)} and now sits ${market.currentSpread!.toFixed(1)} (home-relative). ${market.moveNarrative}`
    : "No opening line is on record yet, so we can't measure how far it has moved."
  return {
    key: "market",
    label: "Market / Line Movement",
    status: "IN_BASE",
    statusLabel: FACTOR_STATUS_LABEL.IN_BASE,
    text: `BSE already leans on the market line when it builds its number, so the current line is baked in. ${movePart} We show the movement as intelligence — we don't add it to the fair spread on top of what's already there.`,
  }
}

function venueFactor(input: NarrativeInput): FactorNarrative {
  const text = input.neutralSite
    ? "This is a neutral-site game, and BSE already knows that when it builds the number. No extra home-field bump is applied."
    : `${input.homeTeam} is at home, and BSE already accounts for home field when it builds the number, so it doesn't tack on another home-field adjustment.`
  return { key: "home_field", label: "Home / Away / Neutral", status: "IN_BASE", statusLabel: FACTOR_STATUS_LABEL.IN_BASE, text }
}

function buildWhy(input: NarrativeInput): FactorNarrative[] {
  return [
    weatherFactor(input),
    { key: "injuries", label: "Injuries / Personnel", status: "DATA_UNAVAILABLE", statusLabel: FACTOR_STATUS_LABEL.DATA_UNAVAILABLE, text: "Injuries can absolutely move a game, but no injury or roster feed is connected yet. BSE applies no adjustment and never assumes a roster is healthy just because we don't have the data." },
    venueFactor(input),
    { key: "rest", label: "Rest / Schedule", status: "IN_BASE", statusLabel: FACTOR_STATUS_LABEL.IN_BASE, text: "Short weeks, byes and extra rest are already part of how BSE builds the number, so we don't count them again here." },
    { key: "travel_altitude", label: "Travel / Altitude / Timezone", status: "NOT_WIRED", statusLabel: FACTOR_STATUS_LABEL.NOT_WIRED, text: "We don't have a tested way to put a point value on travel, altitude or time-zone effects yet, so BSE leaves it alone rather than guessing." },
    matchupFactor(input),
    marketFactor(input),
    { key: "news", label: "News / Context", status: "DATA_UNAVAILABLE", statusLabel: FACTOR_STATUS_LABEL.DATA_UNAVAILABLE, text: "No trusted news feed is connected, so confirmed developments (a coordinator change, a suspension, a scheme shift) aren't factored in. BSE never invents or assumes news." },
  ]
}

/* ------------------------------- BSE READ ------------------------------- */

function buildBseRead(input: NarrativeInput, read: ReadCode): string {
  const { homeTeam, awayTeam, base, context, verdict, marketSpreadHome, market, weather } = input
  const seed = gameSeed(input)
  const baseLabel = formatSpreadTeam(base.fairHomeSpread, homeTeam, awayTeam)
  const finalLabel = formatSpreadTeam(context.finalFairHomeSpread, homeTeam, awayTeam)
  const marketLabel = formatSpreadTeam(marketSpreadHome, homeTeam, awayTeam)

  if (verdict.code === "INSUFFICIENT") {
    return `BSE needs both a model number and a live market line before it will say anything about ${awayTeam} at ${homeTeam}, and one of those isn't in yet. Until both show up, BSE calls nothing and estimates nothing — this read fills in automatically the moment the missing piece lands.`
  }

  const paras: string[] = []
  const edge = verdict.edgePoints
  const fav = favorite(base.fairHomeSpread, homeTeam, awayTeam)
  const hasSide = (read === "LEAN" || read === "FADE") && !!verdict.valueTeam
  const team = verdict.valueTeam

  // 1) WHAT BSE THINKS + the number.
  if (hasSide) {
    paras.push(
      `BSE likes ${team} here. The model makes this game ${finalLabel}, and against a market of ${marketLabel} that's about ${
        edge != null ? abs1(edge) : "—"
      } points of value on ${team}.`,
    )
  } else {
    paras.push(
      `BSE isn't backing a side in ${awayTeam} at ${homeTeam}. The model makes it ${finalLabel} and the market is sitting at ${marketLabel} — not enough daylight between the two to do anything with.`,
    )
  }

  // 2) WHY — matchup drivers, plain, and the no-double-count point.
  if (fav) {
    paras.push(
      `The biggest reason is the matchup itself: ${fav.team}'s efficiency, talent and recent form all tilt their way, which is what makes them roughly a ${fav.mag.toFixed(
        1,
      )}-point favorite. BSE already used all of that to build the number, so we're not counting it twice.`,
    )
  } else {
    paras.push(
      "The matchup reads close to a coin flip — the two teams are similar on talent and efficiency, and that's already baked into the number rather than layered on top.",
    )
  }

  // 3) WHAT COULD GO WRONG — weather (only if material) + the honest caveat.
  const risks: string[] = []
  if (weatherIsMaterial(weather)) {
    risks.push(
      `${gate(seed, 2) ? voiceLine(seed, "weatherRough") + " " : ""}Game-time weather should drag on deep passing and kicking, so expect the scoring environment to take a hit — but it doesn't clearly favor either side, so BSE isn't moving the spread for it.`,
    )
  }
  risks.push(
    "Worth being honest about: BSE isn't tracking injuries or breaking news yet, so a late scratch, a QB change or a suspension wouldn't show up in this read.",
  )
  paras.push(risks.join(" "))

  // 4) THE PRICE + line movement context (only when it moved).
  const priceBits: string[] = [`Our number is ${finalLabel}; the market is ${marketLabel}.`]
  if (base.fairHomeSpread != null && context.netAdjustmentPoints === 0 && baseLabel !== finalLabel) {
    // (defensive; normally base==final today)
  }
  if (meaningfulMove(input) && market.openingSpread != null && market.currentSpread != null) {
    priceBits.push(
      `The line opened ${market.openingSpread.toFixed(1)} and has moved to ${market.currentSpread.toFixed(1)}.`,
    )
  }
  paras.push(priceBits.join(" "))

  // 5) FINAL VERDICT — tied to the same gate/edge.
  if (hasSide) {
    paras.push(
      `Bottom line: that clears BSE's ${base.threshold.toFixed(1)}-point threshold, so BSE leans ${team} at this number. ${voiceLine(
        seed,
        edge != null && Math.abs(edge) >= 2 ? "strongEdge" : "smallEdge",
      )}`,
    )
  } else {
    const fav2 = favorite(context.finalFairHomeSpread, homeTeam, awayTeam)
    if (fav2 && fav2.mag >= 3) {
      paras.push(`Bottom line: good team, wrong price — BSE passes. ${voiceLine(seed, "goodTeamBadPrice")}`)
    } else {
      paras.push(`Bottom line: BSE and the market agree, so there's nothing to act on here. ${voiceLine(seed, "agreement")}`)
    }
  }

  return paras.join("\n\n")
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

/** Build the full narrative (human verdict + key factors + BSE READ + why + ledger). Pure. */
export function buildNarrative(input: NarrativeInput): BreakdownNarrative {
  const read = computeRead(input)
  return {
    read,
    verdict: buildHumanVerdict(input, read.code),
    keyFactors: buildKeyFactors(input),
    why: buildWhy(input),
    bseRead: buildBseRead(input, read.code),
    ledger: buildLedger(input, read),
  }
}
