/**
 * BSE WEATHER IMPACT — pure, deterministic, provider-agnostic.
 * =============================================================
 *
 * Turns ONE real, stadium-accurate, kickoff-hour forecast (already ingested by
 * lib/weather/* into Neon `game_weather`) into a football-relevant IMPACT
 * classification. It does NOT fetch anything and it does NOT touch the frozen
 * model.
 *
 * HONESTY CONTRACT (see the Pro-breakdown objective):
 *   - Weather primarily suppresses SCORING — it is a TOTALS effect. BSE does
 *     NOT model totals, and we have NO validated data on offensive-style
 *     asymmetry (pass-rate, tempo) that would justify moving the SIDE. So this
 *     module returns a real Impact level + plain-English reasoning, and a
 *     `spreadAdjustment` that is DELIBERATELY 0.0 with a documented reason. We
 *     never manufacture a point value we cannot defend.
 *   - The severity thresholds below are transparent HEURISTICS (widely used
 *     football weather bands), not calibrated point coefficients. They classify
 *     conditions; they do not claim a precise scoreboard effect.
 *   - Dome/indoor neutralizes weather. Missing data is reported honestly, never
 *     assumed to be "clear/neutral".
 */

export type WeatherImpactLevel = "none" | "low" | "moderate" | "high"

/**
 * Honest lifecycle of a weather read. The first four mirror the persisted
 * lib/weather/types WeatherDataStatus. "stale" is a PRESENTATION-ONLY state
 * derived at read time when an otherwise-`ok` forecast is too old to be shown
 * as current (e.g. an ingestion outage); it is never written to the database.
 */
export type WeatherReadStatus = "ok" | "indoor" | "pending_kickoff" | "unavailable" | "none_stored" | "stale"

/** Minimal forecast shape the impact calc needs (subset of a game_weather row). */
export interface WeatherImpactInput {
  status: WeatherReadStatus
  temperatureF: number | null
  apparentTemperatureF: number | null
  windSpeedMph: number | null
  windGustMph: number | null
  precipitationProbabilityPct: number | null
  precipitationIntensityMm: number | null
  precipitationType: "none" | "rain" | "snow" | "mixed" | null
  snowfallCm: number | null
  severe: boolean
  weatherDescription: string | null
}

export interface WeatherImpact {
  status: WeatherReadStatus
  level: WeatherImpactLevel
  /** Documented spread adjustment in points. Currently always 0 (totals effect). */
  spreadAdjustment: number
  /** Short factor tags that drove the level, e.g. "Sustained wind 22 mph". */
  factors: string[]
  /** One-to-two sentence plain-English read for the customer. */
  reasoning: string
  /** Why weather did not move the SIDE (the totals-effect disclosure). */
  spreadNote: string
  /** True when we have a real forecast to reason about. */
  hasForecast: boolean
}

const LEVEL_RANK: Record<WeatherImpactLevel, number> = { none: 0, low: 1, moderate: 2, high: 3 }
function maxLevel(a: WeatherImpactLevel, b: WeatherImpactLevel): WeatherImpactLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b
}

export const WEATHER_IMPACT_LABEL: Record<WeatherImpactLevel, string> = {
  none: "NONE",
  low: "LOW",
  moderate: "MODERATE",
  high: "HIGH",
}

/**
 * Wind severity from sustained speed + gusts. Sustained wind is the single most
 * cited weather factor for football (kicking + deep passing). Bands are
 * heuristic, not calibrated point values.
 */
function windLevel(wind: number | null, gust: number | null): { level: WeatherImpactLevel; factor: string | null } {
  const w = wind ?? 0
  const g = gust ?? 0
  let level: WeatherImpactLevel = "none"
  if (w >= 20) level = "high"
  else if (w >= 15) level = "moderate"
  else if (w >= 10) level = "low"
  // Gusts can bump one band even when sustained is lower.
  if (g >= 35) level = maxLevel(level, "high")
  else if (g >= 25) level = maxLevel(level, level === "none" ? "low" : "moderate")
  if (level === "none") return { level, factor: null }
  const parts: string[] = []
  if (w >= 10) parts.push(`sustained wind ${Math.round(w)} mph`)
  if (g >= 25) parts.push(`gusts ${Math.round(g)} mph`)
  return { level, factor: parts.length ? parts.join(", ") : `wind ${Math.round(w)} mph` }
}

/** Precipitation severity, tempered by probability so a 10%-chance shower doesn't over-rate. */
function precipLevel(input: WeatherImpactInput): { level: WeatherImpactLevel; factor: string | null } {
  const prob = input.precipitationProbabilityPct
  const type = input.precipitationType
  const intensity = input.precipitationIntensityMm ?? 0
  const snow = input.snowfallCm ?? 0

  // If the forecast says a real chance is low, do not elevate precip.
  const likely = prob == null ? intensity > 0 || snow > 0 : prob >= 40

  if (input.severe) return { level: "high", factor: "thunderstorm / severe convective activity" }

  if (type === "snow" || type === "mixed" || snow > 0) {
    if (!likely && snow <= 0) return { level: "none", factor: null }
    if (snow >= 2 || intensity >= 4) return { level: "high", factor: `snow (${snow ? `${snow} cm` : "accumulating"})` }
    return { level: "moderate", factor: `snow${snow ? ` ${snow} cm` : ""}` }
  }
  if (type === "rain") {
    if (!likely) return { level: "none", factor: null }
    if (intensity >= 4) return { level: "high", factor: `heavy rain (${intensity} mm/h)` }
    if (intensity >= 1) return { level: "moderate", factor: `steady rain (${intensity} mm/h)` }
    return { level: "low", factor: "light rain" }
  }
  return { level: "none", factor: null }
}

/** Temperature severity from feels-like (falls back to air temp). */
function tempLevel(input: WeatherImpactInput): { level: WeatherImpactLevel; factor: string | null } {
  const t = input.apparentTemperatureF ?? input.temperatureF
  if (t == null) return { level: "none", factor: null }
  if (t <= 10) return { level: "high", factor: `extreme cold (feels ${Math.round(t)}°F)` }
  if (t <= 20) return { level: "moderate", factor: `hard cold (feels ${Math.round(t)}°F)` }
  if (t <= 32) return { level: "low", factor: `freezing (feels ${Math.round(t)}°F)` }
  if (t >= 100) return { level: "high", factor: `extreme heat (feels ${Math.round(t)}°F)` }
  if (t >= 92) return { level: "moderate", factor: `high heat (feels ${Math.round(t)}°F)` }
  return { level: "none", factor: null }
}

const SPREAD_NOTE_ACTIVE =
  "Weather suppresses scoring, which is a TOTALS effect. BSE does not yet model totals, and there is no validated offensive-style asymmetry input to justify moving the side — so no point adjustment is applied to the spread."
const SPREAD_NOTE_CLEAR = "Conditions are benign; no scoring or spread effect."

/**
 * Compute the weather impact for one game from its latest stored reading.
 * Pure — the caller supplies the already-persisted forecast.
 */
export function computeWeatherImpact(input: WeatherImpactInput): WeatherImpact {
  // Honest non-forecast states first.
  if (input.status === "indoor") {
    return {
      status: "indoor",
      level: "none",
      spreadAdjustment: 0,
      factors: ["dome / indoor"],
      reasoning: "Indoor or domed venue — outdoor weather is neutralized and not a factor.",
      spreadNote: SPREAD_NOTE_CLEAR,
      hasForecast: false,
    }
  }
  if (input.status === "pending_kickoff") {
    return {
      status: "pending_kickoff",
      level: "none",
      spreadAdjustment: 0,
      factors: [],
      reasoning: "Kickoff time is not yet set, so a specific game-hour forecast cannot be pulled.",
      spreadNote: "No adjustment — awaiting a confirmed kickoff time.",
      hasForecast: false,
    }
  }
  if (input.status === "stale") {
    return {
      status: "stale",
      level: "none",
      spreadAdjustment: 0,
      factors: [],
      reasoning:
        "The last stored forecast for this game is out of date and hasn't refreshed recently, so BSE won't present it as current conditions.",
      spreadNote: "STALE FORECAST — treated as unavailable, no adjustment applied.",
      hasForecast: false,
    }
  }
  if (input.status === "unavailable" || input.status === "none_stored") {
    return {
      status: input.status,
      level: "none",
      spreadAdjustment: 0,
      factors: [],
      reasoning:
        input.status === "none_stored"
          ? "No forecast has been ingested for this game yet."
          : "A stadium-accurate forecast could not be retrieved for this venue.",
      spreadNote: "DATA CURRENTLY UNAVAILABLE — no adjustment applied.",
      hasForecast: false,
    }
  }

  // Real forecast → classify.
  const wind = windLevel(input.windSpeedMph, input.windGustMph)
  const precip = precipLevel(input)
  const temp = tempLevel(input)

  const level = [wind.level, precip.level, temp.level].reduce(maxLevel, "none" as WeatherImpactLevel)
  const factors = [wind.factor, precip.factor, temp.factor].filter((f): f is string => !!f)

  let reasoning: string
  if (level === "none") {
    reasoning = input.weatherDescription
      ? `${input.weatherDescription} with benign wind and temperature — no meaningful on-field effect.`
      : "Benign conditions — no meaningful on-field effect."
  } else {
    const lead = level === "high" ? "Significant weather" : level === "moderate" ? "Notable weather" : "Minor weather"
    reasoning = `${lead}: ${factors.join("; ")}. This mainly threatens the kicking game, deep passing, and ball security.`
  }

  return {
    status: "ok",
    level,
    spreadAdjustment: 0,
    factors,
    reasoning,
    spreadNote: level === "none" ? SPREAD_NOTE_CLEAR : SPREAD_NOTE_ACTIVE,
    hasForecast: true,
  }
}
