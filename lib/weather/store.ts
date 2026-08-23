/**
 * Weather persistence (Neon `game_weather`).
 *
 * Append-only: each refresh inserts a new row per game so we retain the full
 * forecast history, its lead time before kickoff, and the exact reading the
 * model will consume. NONE of this touches the DraftKings/SGO Blob snapshot.
 */

import { randomUUID } from "node:crypto"
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { gameWeather } from "@/lib/db/schema"
import type { WeatherDataStatus, WeatherReading } from "./types"

export type GameWeatherRow = typeof gameWeather.$inferSelect

/** Most recent weather row for a game (null when none stored yet). */
export async function getLatestWeather(cfbdGameId: string): Promise<GameWeatherRow | null> {
  const rows = await db
    .select()
    .from(gameWeather)
    .where(eq(gameWeather.cfbdGameId, cfbdGameId))
    .orderBy(desc(gameWeather.fetchedAt))
    .limit(1)
  return rows[0] ?? null
}

/** All weather rows for a full week (newest first) — for admin/backtesting. */
export async function getWeekWeather(season: number, week: number): Promise<GameWeatherRow[]> {
  return db
    .select()
    .from(gameWeather)
    .where(and(eq(gameWeather.season, season), eq(gameWeather.week, week)))
    .orderBy(desc(gameWeather.fetchedAt))
}

export interface InsertWeatherInput {
  season: number
  week: number
  cfbdGameId: string
  venueId: number | null
  kickoffIso: string | null
  kickoffTBD: boolean
  indoor: boolean
  provider: string
  dataStatus: WeatherDataStatus
  reading: WeatherReading | null
  now?: number
}

/**
 * Append one weather snapshot. Works for real readings AND honest empty states
 * (indoor / pending_kickoff / unavailable), which store the status with null
 * weather fields — nothing is ever fabricated.
 */
export async function insertWeather(input: InsertWeatherInput): Promise<GameWeatherRow> {
  const now = input.now ?? Date.now()
  const kickoffMs = input.kickoffIso ? Date.parse(input.kickoffIso) : NaN
  const leadTimeMinutes = Number.isFinite(kickoffMs) ? Math.round((kickoffMs - now) / 60000) : null

  const r = input.reading
  const [row] = await db
    .insert(gameWeather)
    .values({
      id: randomUUID(),
      season: input.season,
      week: input.week,
      cfbdGameId: input.cfbdGameId,
      venueId: input.venueId,
      kickoff: input.kickoffIso ? new Date(input.kickoffIso) : null,
      kickoffTBD: input.kickoffTBD,
      indoor: input.indoor,
      provider: input.provider,
      fetchedAt: new Date(now),
      forecastValidFor: r?.forecastValidFor ? new Date(r.forecastValidFor) : null,
      leadTimeMinutes,
      isFinalPregame: false,
      dataStatus: input.dataStatus,
      temperatureF: r?.temperatureF ?? null,
      apparentTemperatureF: r?.apparentTemperatureF ?? null,
      humidityPct: r?.humidityPct ?? null,
      windSpeedMph: r?.windSpeedMph ?? null,
      windGustMph: r?.windGustMph ?? null,
      windDirectionDeg: r?.windDirectionDeg ?? null,
      precipitationProbabilityPct: r?.precipitationProbabilityPct ?? null,
      precipitationIntensityMm: r?.precipitationIntensityMm ?? null,
      precipitationType: r?.precipitationType ?? null,
      rainMm: r?.rainMm ?? null,
      snowfallCm: r?.snowfallCm ?? null,
      cloudCoverPct: r?.cloudCoverPct ?? null,
      weatherCode: r?.weatherCode ?? null,
      weatherDescription: r?.weatherDescription ?? null,
      severe: r?.severe ?? false,
      raw: (r?.raw ?? null) as object | null,
      createdAt: new Date(now),
    })
    .returning()
  return row
}

/**
 * Mark the latest stored row for a game as the official final pre-kickoff
 * record (called once kickoff has passed). Clears the flag on any older rows so
 * exactly one row per game is the frozen game-time reading.
 */
export async function markFinalPregame(cfbdGameId: string): Promise<void> {
  const latest = await getLatestWeather(cfbdGameId)
  if (!latest) return
  await db
    .update(gameWeather)
    .set({ isFinalPregame: false })
    .where(and(eq(gameWeather.cfbdGameId, cfbdGameId), eq(gameWeather.isFinalPregame, true)))
  await db.update(gameWeather).set({ isFinalPregame: true }).where(eq(gameWeather.id, latest.id))
}

/** Has this game already been frozen with a final pregame reading? */
export async function hasFinalPregame(cfbdGameId: string): Promise<boolean> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gameWeather)
    .where(and(eq(gameWeather.cfbdGameId, cfbdGameId), eq(gameWeather.isFinalPregame, true)))
  return (rows[0]?.n ?? 0) > 0
}
