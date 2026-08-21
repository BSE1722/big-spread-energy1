import { NextResponse } from "next/server"
import { getCfbdGames } from "@/lib/cfbd"
import { getCurrentContext } from "@/lib/bse/season"
import {
  fetchSgoNcaafEvents,
  normalizeSgoEvent,
  debugDkOddIDs,
  parseOddID,
  TOTAL_MIN,
  TOTAL_MAX,
  type SgoEvent,
} from "@/lib/sgo"
import { matchOddsToCfbd, type CfbdGameLite } from "@/lib/odds-match"
import { resolveAbbr } from "@/lib/bse/teams"

/**
 * TEMPORARY diagnostic report for the SportsGameOdds integration.
 *
 * Verifies STRICT full-game market normalization before wiring odds site-wide:
 *   1. Five matched Week 1 games with the raw oddID used per market, parsed
 *      segment metadata, and DraftKings spread / moneyline / total + prices.
 *   2. Unmatched games and the reason each failed.
 *   3. The normalized object shape destined for the BSE engine.
 *   4. A validator scan flagging any total outside the plausible range, plus a
 *      raw DraftKings oddID audit for the sample games.
 *
 * Never returns the API key. Safe to delete after review.
 */

export const dynamic = "force-dynamic"

function abbr(team: string): string {
  const cleaned = team.replace(/[^A-Za-z0-9 ]/g, "").trim()
  const words = cleaned.split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase()
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase()
}

/** Parsed segment metadata for a selected oddID (for the report). */
function segMeta(oddID: string | null) {
  if (!oddID) return null
  const s = parseOddID(oddID)
  if (!s) return { oddID, parsed: null }
  return {
    oddID,
    statID: s.statID,
    statEntityID: s.statEntityID,
    periodID: s.periodID,
    betTypeID: s.betTypeID,
    sideID: s.sideID,
  }
}

interface CfbdGame {
  id: number
  season: number
  week: number
  startDate: string
  startTimeTBD: boolean
  neutralSite: boolean
  homeTeam: string
  homeClassification: string | null
  awayTeam: string
  awayClassification: string | null
}

export async function GET() {
  try {
    const ctx = getCurrentContext()

    const [rawGames, rawEvents] = await Promise.all([
      getCfbdGames({
        year: ctx.season,
        week: ctx.week,
        seasonType: ctx.seasonType,
        division: "fbs",
      }) as Promise<CfbdGame[]>,
      fetchSgoNcaafEvents(),
    ])

    // Correlate raw SGO events by eventID for the raw-oddID audit.
    const rawById = new Map<string, SgoEvent>()
    for (const ev of rawEvents) if (ev.eventID) rawById.set(ev.eventID, ev)

    const sgoEvents = rawEvents.map(normalizeSgoEvent)

    const fbs = (Array.isArray(rawGames) ? rawGames : []).filter(
      (g) =>
        (g.homeClassification == null || g.homeClassification === "fbs") &&
        (g.awayClassification == null || g.awayClassification === "fbs"),
    )

    const cfbdGames: CfbdGameLite[] = fbs.map((g) => ({
      id: `cfbd-${g.id}`,
      season: g.season,
      week: g.week,
      kickoff: g.startDate,
      kickoffTBD: g.startTimeTBD,
      neutralSite: g.neutralSite,
      away: { name: g.awayTeam, abbr: resolveAbbr(g.awayTeam) ?? abbr(g.awayTeam) },
      home: { name: g.homeTeam, abbr: resolveAbbr(g.homeTeam) ?? abbr(g.homeTeam) },
    }))

    const result = matchOddsToCfbd(cfbdGames, sgoEvents)
    const matched = result.games.filter((g) => g.oddsStatus === "matched")

    // 1. Five matched games with the raw oddID + parsed metadata + DK values.
    const matchedSample = matched.slice(0, 5).map((g) => ({
      matchup: `${g.away.name} @ ${g.home.name}`,
      kickoff: g.kickoff,
      sgoEventID: g.sgoEventID,
      marketsUsed: {
        spread: segMeta(g.market.sourceOddIDs.spread),
        moneyline: segMeta(g.market.sourceOddIDs.moneyline),
        total: segMeta(g.market.sourceOddIDs.total),
      },
      draftkings: {
        spread: {
          home: `${g.home.abbr} ${g.market.spread.home ?? "?"} (${g.market.spread.homePrice ?? "?"})`,
          away: `${g.away.abbr} ${g.market.spread.away ?? "?"} (${g.market.spread.awayPrice ?? "?"})`,
        },
        moneyline: {
          home: `${g.home.abbr} ${g.market.moneyline.home ?? "?"}`,
          away: `${g.away.abbr} ${g.market.moneyline.away ?? "?"}`,
        },
        total: {
          points: g.market.total.points,
          over: g.market.total.overPrice,
          under: g.market.total.underPrice,
          withinPlausibleRange: g.market.total.withinPlausibleRange,
        },
      },
      updatedAt: g.market.updatedAt,
    }))

    // 4a. Validator scan across ALL matched games — anything flagged for review.
    const flaggedTotals = matched
      .filter((g) => g.market.total.points != null && !g.market.total.withinPlausibleRange)
      .map((g) => ({
        matchup: `${g.away.name} @ ${g.home.name}`,
        total: g.market.total.points,
        oddID: g.market.sourceOddIDs.total,
      }))

    // 4b. Raw DraftKings oddID audit for the sample games (proves derivative
    // markets like team totals / halves / props are present but NOT selected).
    const rawOddAudit = matched.slice(0, 5).map((g) => {
      const raw = g.sgoEventID ? rawById.get(g.sgoEventID) : undefined
      const all = raw ? debugDkOddIDs(raw) : []
      return {
        matchup: `${g.away.name} @ ${g.home.name}`,
        totalDkMarkets: all.length,
        selectedFullGameMainLines: all.filter((o) => o.fullGameMainLine).map((o) => o.oddID),
        // Show any OU markets so we can see team totals / halves that were excluded.
        allOverUnderMarkets: all
          .filter((o) => o.segments?.betTypeID === "ou")
          .map((o) => ({ oddID: o.oddID, overUnder: o.dk.overUnder, selected: o.fullGameMainLine })),
      }
    })

    return NextResponse.json({
      ok: true,
      season: ctx.season,
      week: ctx.week,
      plausibleTotalRange: { min: TOTAL_MIN, max: TOTAL_MAX },
      counts: {
        cfbdFbsGames: cfbdGames.length,
        sgoEventsFetched: sgoEvents.length,
        matched: result.matchedCount,
        unmatched: result.unmatchedCount,
        flaggedTotals: flaggedTotals.length,
      },
      matchedSample,
      unmatched: result.unmatched,
      flaggedTotals,
      rawOddAudit,
      normalizedShapeSample: matched[0] ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
