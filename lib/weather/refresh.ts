/**
 * Weather ingestion orchestrator.
 *
 * Ties the pieces together for the current week:
 *   CFBD schedule (venue_id + kickoff)  →  venue coordinates (Neon `venues`)
 *   →  cadence decision  →  provider fetch  →  append to Neon `game_weather`.
 *
 * INFRASTRUCTURE ONLY. It ingests and stores real, stadium-accurate,
 * kickoff-hour forecasts. It does NOT compute any BSE Rating, fair line, or
 * weather weighting — that methodology is applied separately later. It also
 * never reads or writes the DraftKings/SGO odds snapshot.
 */

import { getCfbdGameLites, type SeasonContextLite } from "@/lib/board-build"
import { getWeatherProvider } from "./provider"
import { decideRefresh } from "./cadence"
import { ensureVenues, getVenueById } from "./venues"
import { getLatestWeather, insertWeather, markFinalPregame, hasFinalPregame } from "./store"
import type { WeatherDataStatus } from "./types"

export interface WeatherRefreshSummary {
  season: number
  week: number
  provider: string
  games: number
  fetched: number
  skippedNotDue: number
  indoor: number
  pendingKickoff: number
  unavailable: number
  frozenFinal: number
  ranAt: string
}

/**
 * Run one ingestion pass over the current week. Idempotent and cadence-aware:
 * only games actually "due" per the tiered policy get a fresh pull, so this is
 * safe to trigger frequently (manual admin action or a scheduler).
 */
export async function refreshWeather(ctx: SeasonContextLite): Promise<WeatherRefreshSummary> {
  const provider = getWeatherProvider()
  const now = Date.now()

  // Make sure venue coordinates are available before we resolve any game.
  await ensureVenues()

  const games = await getCfbdGameLites(ctx)

  const summary: WeatherRefreshSummary = {
    season: ctx.season,
    week: ctx.week,
    provider: provider.name,
    games: games.length,
    fetched: 0,
    skippedNotDue: 0,
    indoor: 0,
    pendingKickoff: 0,
    unavailable: 0,
    frozenFinal: 0,
    ranAt: new Date(now).toISOString(),
  }

  for (const g of games) {
    const kickoffMs = Date.parse(g.kickoff)
    const latest = await getLatestWeather(g.id)
    const lastFetchedMs = latest ? Date.parse(String(latest.fetchedAt)) : null

    // --- Kickoff already passed: freeze the final pre-kickoff reading once. ---
    if (Number.isFinite(kickoffMs) && kickoffMs - now <= 0) {
      if (!(await hasFinalPregame(g.id)) && latest) {
        await markFinalPregame(g.id)
        summary.frozenFinal++
      }
      continue
    }

    // --- TBD kickoff: cannot forecast a specific hour; record honest state. ---
    if (g.kickoffTBD || !Number.isFinite(kickoffMs)) {
      // Only record the pending state once (avoid piling up identical rows).
      if (!latest || latest.dataStatus !== "pending_kickoff") {
        await recordState(ctx, g, "pending_kickoff", null, now)
        summary.pendingKickoff++
      } else {
        summary.skippedNotDue++
      }
      continue
    }

    // --- Cadence gate. ---
    const decision = decideRefresh({ kickoffMs, lastFetchedMs, now })
    if (!decision.due) {
      summary.skippedNotDue++
      continue
    }

    // --- Resolve real stadium coordinates + dome from the venue cache. ---
    const venue = g.venueId != null ? await getVenueById(g.venueId) : null

    // --- Dome/indoor: outdoor weather intentionally not a factor. ---
    if (venue?.dome) {
      await recordState(ctx, g, "indoor", venue.id, now)
      summary.indoor++
      continue
    }

    // --- No usable coordinates: honest unavailable, never fabricated. ---
    if (!venue || venue.latitude == null || venue.longitude == null) {
      await recordState(ctx, g, "unavailable", venue?.id ?? g.venueId ?? null, now)
      summary.unavailable++
      continue
    }

    // --- Real forecast pull for the stadium coordinates + kickoff hour. ---
    try {
      const reading = await provider.fetchKickoffHour({
        latitude: venue.latitude,
        longitude: venue.longitude,
        kickoffIso: g.kickoff,
      })
      await insertWeather({
        season: ctx.season,
        week: ctx.week,
        cfbdGameId: g.id,
        venueId: venue.id,
        kickoffIso: g.kickoff,
        kickoffTBD: false,
        indoor: false,
        provider: provider.name,
        dataStatus: "ok",
        reading,
        now,
      })
      summary.fetched++
    } catch (err) {
      console.log(`[v0] weather fetch failed for ${g.id}:`, (err as Error)?.message)
      await recordState(ctx, g, "unavailable", venue.id, now)
      summary.unavailable++
    }
  }

  return summary
}

/** Append an honest non-forecast state row (indoor/pending/unavailable). */
async function recordState(
  ctx: SeasonContextLite,
  g: { id: string; kickoff: string; kickoffTBD: boolean; venueId?: number | null },
  status: WeatherDataStatus,
  venueId: number | null,
  now: number,
) {
  await insertWeather({
    season: ctx.season,
    week: ctx.week,
    cfbdGameId: g.id,
    venueId,
    kickoffIso: Number.isFinite(Date.parse(g.kickoff)) ? g.kickoff : null,
    kickoffTBD: g.kickoffTBD,
    indoor: status === "indoor",
    provider: getWeatherProvider().name,
    dataStatus: status,
    reading: null,
    now,
  })
}
