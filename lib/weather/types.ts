/**
 * Provider-agnostic weather contracts.
 *
 * This is INFRASTRUCTURE ONLY. Nothing here computes a BSE Rating, fair line,
 * or any weather weighting — those are defined separately once the methodology
 * is provided. The job of this layer is to fetch a real, stadium-accurate,
 * kickoff-hour forecast and normalize it into a stable shape the model can
 * later read.
 */

/** Normalized precipitation classification, provider-agnostic. */
export type PrecipitationType = "none" | "rain" | "snow" | "mixed"

/** Status of a weather reading for a game (drives honest empty states). */
export type WeatherDataStatus =
  | "ok" // real forecast retrieved
  | "indoor" // dome/roof — outdoor weather intentionally not a factor
  | "pending_kickoff" // kickoff time TBD — cannot forecast a specific hour yet
  | "unavailable" // no coordinates / provider failure — never fabricated

/**
 * A single normalized, provider-agnostic weather reading for one game hour.
 * Every provider must map its raw payload into exactly this shape so the model
 * and storage never depend on a specific vendor.
 */
export interface WeatherReading {
  provider: string
  /** ISO timestamp (UTC) of the forecast hour actually used. */
  forecastValidFor: string | null
  temperatureF: number | null
  apparentTemperatureF: number | null
  humidityPct: number | null
  windSpeedMph: number | null
  windGustMph: number | null
  windDirectionDeg: number | null
  precipitationProbabilityPct: number | null
  precipitationIntensityMm: number | null
  precipitationType: PrecipitationType | null
  rainMm: number | null
  snowfallCm: number | null
  cloudCoverPct: number | null
  weatherCode: number | null
  weatherDescription: string | null
  /** True for thunderstorm / severe convective codes. */
  severe: boolean
  /** Full raw provider payload, retained for auditing + backtesting. */
  raw: unknown
}

/** Everything a provider needs to fetch one game's kickoff-hour forecast. */
export interface WeatherQuery {
  latitude: number
  longitude: number
  /** Scheduled kickoff (ISO, UTC). The provider returns the matching hour. */
  kickoffIso: string
}

/**
 * A pluggable weather source. Swapping or supplementing Open-Meteo later means
 * adding another implementation of THIS interface — the model, storage, and
 * frontend never change.
 */
export interface WeatherProvider {
  readonly name: string
  fetchKickoffHour(query: WeatherQuery): Promise<WeatherReading>
}
