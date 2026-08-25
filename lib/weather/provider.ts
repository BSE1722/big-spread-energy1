/**
 * Weather provider selector.
 *
 * The rest of the app depends on this module, never on a concrete provider.
 * To add or supplement a source later (Tomorrow.io, NWS, an ensemble), register
 * it here and/or point WEATHER_PROVIDER at it — the model, storage, ingestion
 * job, and frontend stay unchanged.
 */

import type { WeatherProvider } from "./types"
import { openMeteoProvider } from "./open-meteo"

const PROVIDERS: Record<string, WeatherProvider> = {
  [openMeteoProvider.name]: openMeteoProvider,
}

/** Default provider name; overridable via env without code changes. */
const DEFAULT_PROVIDER = "open-meteo"

/**
 * Resolve the active weather provider. Honors the optional WEATHER_PROVIDER env
 * var, falling back to Open-Meteo when unset or unknown.
 */
export function getWeatherProvider(): WeatherProvider {
  const requested = process.env.WEATHER_PROVIDER?.trim().toLowerCase()
  if (requested && PROVIDERS[requested]) return PROVIDERS[requested]
  return PROVIDERS[DEFAULT_PROVIDER]
}

/** Register an additional provider at runtime (used by future integrations). */
export function registerWeatherProvider(provider: WeatherProvider): void {
  PROVIDERS[provider.name] = provider
}
