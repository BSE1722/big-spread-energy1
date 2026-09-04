import "server-only"

import { getCfbdGameLites } from "@/lib/board-build"
import { getCurrentContext } from "@/lib/bse/season"
import { loadSnapshot } from "@/lib/odds-snapshot"
import { getBoardSignalForGame } from "@/lib/board-signal/service"
import { getFrozenCandidate } from "@/lib/shadow/service"
import { getLatestWeather } from "@/lib/weather/store"
import { describeSignal, LEAN_THRESHOLD, type SignalDescription } from "@/lib/bse/model-signal"
import { evaluateBet, type BetEvaluation } from "@/lib/bse/price-aware"
import { computeWeatherImpact, type WeatherImpact, type WeatherImpactInput, type WeatherReadStatus } from "@/lib/bse/weather-impact"
import {
  assembleContextRead,
  computeVerdict,
  readStrength,
  valueThresholds,
  whatCouldChange,
  CONTEXT_FACTORS,
  type ContextRead,
  type Verdict,
  type ReadStrength,
  type ValueThresholds,
  type ChangeTrigger,
  type ContextFactor,
} from "@/lib/bse/context-engine"
import { buildNarrative, type BreakdownNarrative } from "@/lib/breakdown/narrative"
import type { GameWithOdds } from "@/lib/odds-match"

function round1(n: number | null): number | null {
  return n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10
}

/* -------------------------------- Types --------------------------------- */

export interface BreakdownHeaderData {
  id: string
  season: number
  week: number
  kickoff: string
  kickoffTBD: boolean
  neutralSite: boolean
  away: { name: string; abbr: string }
  home: { name: string; abbr: string }
  marketSpread: number | null
  marketTotal: number | null
  marketMoneyline: { home: number | null; away: number | null }
  oddsStatus: "matched" | "unavailable"
  bseRating: number | null
}

export interface MarketIntel {
  openingSpread: number | null
  previousSpread: number | null
  currentSpread: number | null
  spreadMovement: number | null
  openingTotal: number | null
  previousTotal: number | null
  currentTotal: number | null
  totalMovement: number | null
  baseFairHomeSpread: number | null
  finalFairHomeSpread: number | null
  /** Home-relative points of value at the opening number vs FINAL fair. */
  edgeAtOpenHome: number | null
  /** Home-relative points of value at the current number vs FINAL fair. */
  edgeNowHome: number | null
  moveDirection: "toward" | "away" | "none" | null
  moveNarrative: string
}

export interface WeatherDetail {
  fetchedAt: string | null
  forecastValidFor: string | null
  leadTimeMinutes: number | null
  temperatureF: number | null
  apparentTemperatureF: number | null
  windSpeedMph: number | null
  windGustMph: number | null
  windDirectionDeg: number | null
  precipitationProbabilityPct: number | null
  precipitationType: string | null
  humidityPct: number | null
  weatherDescription: string | null
}

export interface AltLab {
  finalFairHomeSpread: number | null
  marketSpreadHome: number | null
  homeSpreadPrice: number | null
  awaySpreadPrice: number | null
  thresholds: ValueThresholds | null
  homeMainEval: BetEvaluation | null
  awayMainEval: BetEvaluation | null
}

export interface Freshness {
  model: { at: string | null; hash: string | null }
  market: { at: string | null; status: string }
  weather: { at: string | null; status: WeatherReadStatus; leadTimeMinutes: number | null }
  injuries: { status: "unavailable"; note: string }
  news: { status: "unavailable"; note: string }
}

export interface BreakdownAnalysis {
  modelAvailable: boolean
  inValidationNote: string
  homeTeam: string
  awayTeam: string
  marketSpreadHome: number | null
  base: {
    fairHomeSpread: number | null
    edgePoints: number | null
    rating: number | null
    lean: SignalDescription["lean"] | null
    leanTeam: string | null
    threshold: number
  }
  context: ContextRead
  verdict: Verdict
  readStrength: ReadStrength
  narrative: BreakdownNarrative
  factors: ContextFactor[]
  marketIntel: MarketIntel
  weather: WeatherImpact
  weatherDetail: WeatherDetail | null
  altLab: AltLab
  whatCouldChange: ChangeTrigger[]
  freshness: Freshness
}

export interface AssembledBreakdown {
  found: boolean
  header: BreakdownHeaderData | null
  signal: SignalDescription | null
  analysis: BreakdownAnalysis | null
  snapshotAt: string | null
}

/* ------------------------------ Assembler ------------------------------- */

const IN_VALIDATION_NOTE =
  "The BSE base number is the frozen model under live 2026 validation — a research signal, not a performance guarantee or a betting instruction. Context adjustments are documented and auditable."

/** Map a stored weather row (or absence) into the pure impact-calc input. */
function toWeatherInput(row: Awaited<ReturnType<typeof getLatestWeather>>): WeatherImpactInput {
  if (!row) {
    return {
      status: "none_stored",
      temperatureF: null,
      apparentTemperatureF: null,
      windSpeedMph: null,
      windGustMph: null,
      precipitationProbabilityPct: null,
      precipitationIntensityMm: null,
      precipitationType: null,
      snowfallCm: null,
      severe: false,
      weatherDescription: null,
    }
  }
  const status = (["ok", "indoor", "pending_kickoff", "unavailable"].includes(row.dataStatus)
    ? row.dataStatus
    : "unavailable") as WeatherReadStatus
  const precip = (["none", "rain", "snow", "mixed"].includes(String(row.precipitationType))
    ? row.precipitationType
    : null) as WeatherImpactInput["precipitationType"]
  return {
    status,
    temperatureF: row.temperatureF,
    apparentTemperatureF: row.apparentTemperatureF,
    windSpeedMph: row.windSpeedMph,
    windGustMph: row.windGustMph,
    precipitationProbabilityPct: row.precipitationProbabilityPct,
    precipitationIntensityMm: row.precipitationIntensityMm,
    precipitationType: precip,
    snowfallCm: row.snowfallCm,
    severe: row.severe,
    weatherDescription: row.weatherDescription,
  }
}

function marketIntelFrom(
  lineHistory: GameWithOdds["lineHistory"] | null,
  baseFair: number | null,
  finalFair: number | null,
): MarketIntel {
  const lh = lineHistory
  const edgeAtOpenHome =
    lh?.openingSpread != null && finalFair != null ? round1(lh.openingSpread - finalFair) : null
  const edgeNowHome = lh?.currentSpread != null && finalFair != null ? round1(lh.currentSpread - finalFair) : null

  let moveDirection: MarketIntel["moveDirection"] = null
  let moveNarrative = "No opening line recorded yet, so movement versus BSE can't be measured."
  if (edgeAtOpenHome != null && edgeNowHome != null) {
    const openAbs = Math.abs(edgeAtOpenHome)
    const nowAbs = Math.abs(edgeNowHome)
    const delta = round1(nowAbs - openAbs) ?? 0
    if (Math.abs(delta) < 0.25) {
      moveDirection = "none"
      moveNarrative = "The market has barely moved relative to BSE; the edge is essentially where it opened."
    } else if (nowAbs < openAbs) {
      moveDirection = "toward"
      moveNarrative = `The market moved toward BSE — the value shrank from ${openAbs.toFixed(1)} to ${nowAbs.toFixed(
        1,
      )} points, so much of the original edge has been priced out.`
    } else {
      moveDirection = "away"
      moveNarrative = `The market moved away from BSE — the value grew from ${openAbs.toFixed(1)} to ${nowAbs.toFixed(
        1,
      )} points.`
    }
  }

  return {
    openingSpread: lh?.openingSpread ?? null,
    previousSpread: lh?.previousSpread ?? null,
    currentSpread: lh?.currentSpread ?? null,
    spreadMovement: lh?.spreadMovement ?? null,
    openingTotal: lh?.openingTotal ?? null,
    previousTotal: lh?.previousTotal ?? null,
    currentTotal: lh?.currentTotal ?? null,
    totalMovement: lh?.totalMovement ?? null,
    baseFairHomeSpread: baseFair,
    finalFairHomeSpread: finalFair,
    edgeAtOpenHome,
    edgeNowHome,
    moveDirection,
    moveNarrative,
  }
}

/**
 * Assemble the full breakdown for a game. Pure data-shaping over already-
 * persisted sources; never fetches an external provider beyond the schedule/
 * snapshot the board already uses. Access gating stays with the caller.
 */
export async function assembleBreakdown(gameId: string): Promise<AssembledBreakdown> {
  const ctx = getCurrentContext()
  const cfbdGames = await getCfbdGameLites(ctx).catch(() => [])
  const game = cfbdGames.find((g) => g.id === gameId) ?? null
  if (!game) return { found: false, header: null, signal: null, analysis: null, snapshotAt: null }

  const snapshot = await loadSnapshot().catch(() => null)
  const snap: GameWithOdds | undefined = snapshot?.games.find((s) => s.cfbdId === gameId)
  const matched = snap?.oddsStatus === "matched"
  const m = snap?.market
  const marketSpreadHome = matched && m ? m.spread.home : null
  const marketTotal = matched && m && m.total.points != null && m.total.withinPlausibleRange ? m.total.points : null

  const { signal: sig } = await getBoardSignalForGame(game.season, game.week, gameId).catch(() => ({ signal: null }))
  const signal: SignalDescription | null = sig ? describeSignal(sig, game.home.name, game.away.name, LEAN_THRESHOLD) : null

  const header: BreakdownHeaderData = {
    id: game.id,
    season: game.season,
    week: game.week,
    kickoff: game.kickoff,
    kickoffTBD: game.kickoffTBD,
    neutralSite: game.neutralSite,
    away: { name: game.away.name, abbr: game.away.abbr },
    home: { name: game.home.name, abbr: game.home.abbr },
    marketSpread: marketSpreadHome,
    marketTotal,
    marketMoneyline: { home: m?.moneyline.home ?? null, away: m?.moneyline.away ?? null },
    oddsStatus: snap?.oddsStatus ?? "unavailable",
    bseRating: signal ? signal.rating : null,
  }

  // --- Weather (real, from Neon game_weather) ---
  const weatherRow = await getLatestWeather(gameId).catch(() => null)
  const weather = computeWeatherImpact(toWeatherInput(weatherRow))
  const weatherDetail: WeatherDetail | null = weatherRow
    ? {
        fetchedAt: weatherRow.fetchedAt ? new Date(String(weatherRow.fetchedAt)).toISOString() : null,
        forecastValidFor: weatherRow.forecastValidFor ? new Date(String(weatherRow.forecastValidFor)).toISOString() : null,
        leadTimeMinutes: weatherRow.leadTimeMinutes,
        temperatureF: weatherRow.temperatureF,
        apparentTemperatureF: weatherRow.apparentTemperatureF,
        windSpeedMph: weatherRow.windSpeedMph,
        windGustMph: weatherRow.windGustMph,
        windDirectionDeg: weatherRow.windDirectionDeg,
        precipitationProbabilityPct: weatherRow.precipitationProbabilityPct,
        precipitationType: weatherRow.precipitationType,
        humidityPct: weatherRow.humidityPct,
        weatherDescription: weatherRow.weatherDescription,
      }
    : null

  // --- Base → Final ledger ---
  const baseFair = sig ? sig.fairHomeSpread : null
  const context = assembleContextRead({ baseFairHomeSpread: baseFair, weather })
  const finalFair = context.finalFairHomeSpread

  // --- Verdict (value side price folded in) ---
  const edgeHome = finalFair != null && marketSpreadHome != null ? round1(marketSpreadHome - finalFair) : null
  const valueSidePrice =
    edgeHome == null ? null : edgeHome > 0 ? (m?.spread.homePrice ?? null) : (m?.spread.awayPrice ?? null)
  const verdict = computeVerdict({
    finalFairHomeSpread: finalFair,
    marketSpreadHome,
    homeTeam: game.home.name,
    awayTeam: game.away.name,
    valueSidePrice,
  })

  const strength = readStrength(verdict.edgePoints, signal ? signal.rating : null)
  const thresholds = valueThresholds(finalFair, game.home.name, game.away.name)

  // --- Alternate Spread Lab: evaluate both sides at the current main line ---
  const homeMainEval =
    marketSpreadHome != null
      ? evaluateBet({ fairHomeSpread: finalFair, offeredHomeSpread: marketSpreadHome, price: m?.spread.homePrice ?? null, side: "home" })
      : null
  const awayMainEval =
    marketSpreadHome != null
      ? evaluateBet({ fairHomeSpread: finalFair, offeredHomeSpread: marketSpreadHome, price: m?.spread.awayPrice ?? null, side: "away" })
      : null

  const altLab: AltLab = {
    finalFairHomeSpread: finalFair,
    marketSpreadHome,
    homeSpreadPrice: m?.spread.homePrice ?? null,
    awaySpreadPrice: m?.spread.awayPrice ?? null,
    thresholds,
    homeMainEval,
    awayMainEval,
  }

  const marketIntel = marketIntelFrom(snap?.lineHistory ?? null, context.baseFairHomeSpread, finalFair)
  const changes = whatCouldChange({ verdict, thresholds, weather })

  // --- Narrative layer (pure prose + itemized ledger over the audited read) ---
  const narrative = buildNarrative({
    homeTeam: game.home.name,
    awayTeam: game.away.name,
    neutralSite: game.neutralSite,
    base: {
      fairHomeSpread: baseFair,
      edgePoints: sig ? sig.edge : null,
      rating: signal ? signal.rating : null,
      threshold: LEAN_THRESHOLD,
    },
    context,
    verdict,
    marketSpreadHome,
    market: {
      openingSpread: marketIntel.openingSpread,
      currentSpread: marketIntel.currentSpread,
      spreadMovement: marketIntel.spreadMovement,
      moveDirection: marketIntel.moveDirection,
      moveNarrative: marketIntel.moveNarrative,
    },
    weather,
    weatherDetail: weatherDetail
      ? {
          temperatureF: weatherDetail.temperatureF,
          windSpeedMph: weatherDetail.windSpeedMph,
          windGustMph: weatherDetail.windGustMph,
          precipitationProbabilityPct: weatherDetail.precipitationProbabilityPct,
          humidityPct: weatherDetail.humidityPct,
        }
      : null,
  })

  const candidate = await getFrozenCandidate().catch(() => null)
  const freshness: Freshness = {
    model: { at: candidate?.frozenAt ?? null, hash: candidate?.modelHash ?? null },
    market: { at: snapshot?.snapshotAt ?? null, status: header.oddsStatus },
    weather: { at: weatherDetail?.fetchedAt ?? null, status: weather.status, leadTimeMinutes: weatherDetail?.leadTimeMinutes ?? null },
    injuries: { status: "unavailable", note: "No injury/roster provider connected." },
    news: { status: "unavailable", note: "No news provider connected." },
  }

  const analysis: BreakdownAnalysis = {
    modelAvailable: !!sig,
    inValidationNote: IN_VALIDATION_NOTE,
    homeTeam: game.home.name,
    awayTeam: game.away.name,
    marketSpreadHome,
    base: {
      fairHomeSpread: baseFair,
      edgePoints: sig ? sig.edge : null,
      rating: signal ? signal.rating : null,
      lean: signal ? signal.lean : null,
      leanTeam: signal ? signal.leanTeam : null,
      threshold: LEAN_THRESHOLD,
    },
    context,
    verdict,
    readStrength: strength,
    narrative,
    factors: CONTEXT_FACTORS,
    marketIntel,
    weather,
    weatherDetail,
    altLab,
    whatCouldChange: changes,
    freshness,
  }

  return { found: true, header, signal, analysis, snapshotAt: snapshot?.snapshotAt ?? null }
}
