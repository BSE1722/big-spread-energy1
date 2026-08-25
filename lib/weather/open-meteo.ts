/**
 * Open-Meteo weather provider (default).
 *
 * Free, keyless, forecast-by-coordinate-and-hour — a good starting source while
 * the weighting methodology is still being defined. It implements the shared
 * WeatherProvider interface so it can later be replaced or ensembled with a
 * keyed provider (Tomorrow.io, NWS) without touching the model or storage.
 *
 * Docs: https://open-meteo.com/en/docs
 */

import type { PrecipitationType, WeatherProvider, WeatherQuery, WeatherReading } from "./types"

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

/** WMO weather-code → short human description (for display/audit only). */
const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
}

/** Codes we flag as severe (thunderstorm / convective). */
const SEVERE_CODES = new Set([95, 96, 99])

function describe(code: number | null): string | null {
  if (code == null) return null
  return WMO_CODES[code] ?? `WMO ${code}`
}

function classifyPrecip(code: number | null, rainMm: number | null, snowCm: number | null): PrecipitationType | null {
  const hasRain = (rainMm ?? 0) > 0
  const hasSnow = (snowCm ?? 0) > 0
  if (hasRain && hasSnow) return "mixed"
  if (hasSnow) return "snow"
  if (hasRain) return "rain"
  // Fall back to code families when intensities are zero but code implies precip.
  if (code != null) {
    if (code >= 71 && code <= 77) return "snow"
    if (code === 85 || code === 86) return "snow"
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || SEVERE_CODES.has(code)) return "rain"
  }
  return "none"
}

/** Round to a sane precision; pass through null. */
function r(value: number | null | undefined, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/** UTC calendar date (YYYY-MM-DD) for the Open-Meteo start/end window. */
function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface OpenMeteoResponse {
  hourly?: {
    time?: string[]
    temperature_2m?: (number | null)[]
    apparent_temperature?: (number | null)[]
    relative_humidity_2m?: (number | null)[]
    wind_speed_10m?: (number | null)[]
    wind_gusts_10m?: (number | null)[]
    wind_direction_10m?: (number | null)[]
    precipitation_probability?: (number | null)[]
    precipitation?: (number | null)[]
    rain?: (number | null)[]
    snowfall?: (number | null)[]
    cloud_cover?: (number | null)[]
    weather_code?: (number | null)[]
  }
}

/** Index of the hourly entry closest to the kickoff timestamp. */
function nearestHourIndex(times: string[], kickoffMs: number): number {
  let best = -1
  let bestDelta = Number.POSITIVE_INFINITY
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(`${times[i]}Z`) // Open-Meteo hourly times are UTC when timezone=UTC
    if (!Number.isFinite(t)) continue
    const delta = Math.abs(t - kickoffMs)
    if (delta < bestDelta) {
      bestDelta = delta
      best = i
    }
  }
  return best
}

export const openMeteoProvider: WeatherProvider = {
  name: "open-meteo",

  async fetchKickoffHour(query: WeatherQuery): Promise<WeatherReading> {
    const kickoffMs = Date.parse(query.kickoffIso)
    if (!Number.isFinite(kickoffMs)) {
      throw new Error("open-meteo: invalid kickoffIso")
    }

    // Request a 3-day UTC window centered on kickoff so the nearest hour is
    // always covered regardless of venue timezone.
    const start = new Date(kickoffMs - 24 * 60 * 60 * 1000)
    const end = new Date(kickoffMs + 24 * 60 * 60 * 1000)

    const params = new URLSearchParams({
      latitude: String(query.latitude),
      longitude: String(query.longitude),
      hourly: [
        "temperature_2m",
        "apparent_temperature",
        "relative_humidity_2m",
        "wind_speed_10m",
        "wind_gusts_10m",
        "wind_direction_10m",
        "precipitation_probability",
        "precipitation",
        "rain",
        "snowfall",
        "cloud_cover",
        "weather_code",
      ].join(","),
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      precipitation_unit: "mm",
      timezone: "UTC",
      start_date: utcDate(start),
      end_date: utcDate(end),
    })

    const res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      // Weather refresh is driven explicitly by the ingestion job; do not let
      // the framework cache upstream forecasts.
      cache: "no-store",
    })
    if (!res.ok) {
      throw new Error(`open-meteo request failed: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as OpenMeteoResponse
    const h = data.hourly
    const times = h?.time ?? []
    if (!h || times.length === 0) {
      throw new Error("open-meteo: empty hourly forecast")
    }

    const i = nearestHourIndex(times, kickoffMs)
    if (i < 0) {
      throw new Error("open-meteo: no matching forecast hour")
    }

    const code = h.weather_code?.[i] ?? null
    const rainMm = r(h.rain?.[i])
    const snowfallCm = r(h.snowfall?.[i])

    return {
      provider: "open-meteo",
      forecastValidFor: new Date(Date.parse(`${times[i]}Z`)).toISOString(),
      temperatureF: r(h.temperature_2m?.[i]),
      apparentTemperatureF: r(h.apparent_temperature?.[i]),
      humidityPct: r(h.relative_humidity_2m?.[i]),
      windSpeedMph: r(h.wind_speed_10m?.[i]),
      windGustMph: r(h.wind_gusts_10m?.[i]),
      windDirectionDeg: r(h.wind_direction_10m?.[i]),
      precipitationProbabilityPct: r(h.precipitation_probability?.[i]),
      precipitationIntensityMm: r(h.precipitation?.[i]),
      precipitationType: classifyPrecip(code, rainMm, snowfallCm),
      rainMm,
      snowfallCm,
      cloudCoverPct: r(h.cloud_cover?.[i]),
      weatherCode: code,
      weatherDescription: describe(code),
      severe: code != null && SEVERE_CODES.has(code),
      raw: { hourIndex: i, hourTime: times[i], hourly: pickHour(h, i) },
    }
  },
}

/** Extract just the chosen hour's raw values (keeps stored payload compact). */
function pickHour(h: NonNullable<OpenMeteoResponse["hourly"]>, i: number) {
  const out: Record<string, unknown> = {}
  for (const [key, arr] of Object.entries(h)) {
    if (key === "time") continue
    if (Array.isArray(arr)) out[key] = (arr as unknown[])[i] ?? null
  }
  return out
}
