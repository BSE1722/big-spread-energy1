import "server-only"

import { getCurrentContext } from "@/lib/bse/season"
import { getCfbdGameLites } from "@/lib/board-build"
import { loadSnapshot } from "@/lib/odds-snapshot"
import { getBoardSignals } from "@/lib/board-signal/service"
import type { GameWithOdds } from "@/lib/odds-match"
import { rawWeekForCanonical, canonicalWeekForGame } from "@/lib/bse/week-identity"
import type { LiveBoardGame } from "@/lib/use-live-board"

/**
 * SERVER-SIDE authoritative build of the live board slate.
 *
 * This is the single source the customer Board API (`/api/cfbd-board`) AND the
 * gated tool server actions (`app/actions/tools.ts`) both read, so a logged-in
 * user's analyzer/parlay run is graded against the EXACT same numbers a visitor
 * sees on The Board — never a client-supplied value. It performs no odds pull
 * (reads the frozen snapshot) and no model recompute (reads the frozen signal
 * cache); it only assembles them onto the live CFBD schedule.
 */

export interface LiveBoardOk {
  ok: true
  season: number
  week: number
  seasonType: string
  projectionsAvailable: boolean
  oddsAvailable: boolean
  count: number
  oddsMatchedCount: number
  oddsUnmatchedCount: number
  snapshotAt: string | null
  previousSnapshotAt: string | null
  games: LiveBoardGame[]
}

export interface LiveBoardErr {
  ok: false
  status: number
  retryable?: boolean
  error: string
}

export type LiveBoardFeed = LiveBoardOk | LiveBoardErr

export async function getLiveBoard(): Promise<LiveBoardFeed> {
  try {
    const ctx = getCurrentContext()

    let scheduleError: unknown = null
    const [cfbdGames, snapshot, signals] = await Promise.all([
      getCfbdGameLites(ctx).catch((err) => {
        scheduleError = err
        return [] as Awaited<ReturnType<typeof getCfbdGameLites>>
      }),
      loadSnapshot().catch((err) => {
        console.error("[v0] snapshot load failed; rendering schedule without odds:", err)
        return null
      }),
      // Signals are stored under the RAW provider week; translate the canonical
      // week before querying. The per-game id match against the (already
      // canonical-filtered) schedule keeps a Week 0 signal off the Week 1 board.
      getBoardSignals(ctx.season, rawWeekForCanonical(ctx.week)).catch((err) => {
        console.error("[v0] board signals load failed; rendering board without ratings:", err)
        return { meta: null, byGameId: new Map() }
      }),
    ])

    if (scheduleError && cfbdGames.length === 0) {
      const msg = scheduleError instanceof Error ? scheduleError.message : String(scheduleError)
      const rateLimited = /\b429\b|too many requests/i.test(msg)
      console.error("[v0] board schedule unavailable (no cached fallback):", scheduleError)
      return {
        ok: false,
        status: 503,
        retryable: true,
        error: rateLimited
          ? "The live schedule provider (CFBD) is rate-limiting requests right now. This is temporary — the board will refresh automatically in a moment."
          : "The live schedule is temporarily unavailable. The board will refresh automatically in a moment.",
      }
    }

    const oddsById = new Map<string, GameWithOdds>()
    if (snapshot) for (const g of snapshot.games) oddsById.set(g.cfbdId, g)

    const rows: LiveBoardGame[] = cfbdGames
      .map((g) => {
        const snap = oddsById.get(g.id)
        const matched = snap?.oddsStatus === "matched"
        const m = snap?.market
        const sig = signals.byGameId.get(g.id)

        const marketTotal =
          matched && m && m.total.points != null && m.total.withinPlausibleRange ? m.total.points : null

        return {
          id: g.id,
          season: g.season,
          week: canonicalWeekForGame(g.season, g.week, g.kickoff),
          kickoff: g.kickoff,
          kickoffTBD: g.kickoffTBD,
          neutralSite: g.neutralSite,
          away: { name: g.away.name, abbr: g.away.abbr },
          home: { name: g.home.name, abbr: g.home.abbr },

          marketSpread: matched && m ? m.spread.home : null,
          marketSpreadPrice: {
            home: matched && m ? m.spread.homePrice : null,
            away: matched && m ? m.spread.awayPrice : null,
          },
          marketTotal,
          marketMoneyline: {
            home: m?.moneyline.home ?? null,
            away: m?.moneyline.away ?? null,
          },
          oddsStatus: snap?.oddsStatus ?? "unavailable",

          odds: {
            bookmaker: m?.bookmaker ?? "draftkings",
            sgoEventID: snap?.sgoEventID ?? null,
            sourceOddIDs: m?.sourceOddIDs ?? { spread: null, moneyline: null, total: null },
            updatedAt: m?.updatedAt ?? null,
            totalWithinPlausibleRange: m?.total.withinPlausibleRange ?? true,
            rawTotalPoints: m?.total.points ?? null,
            lineHistory: snap?.lineHistory ?? null,
          },

          fairSpread: sig ? sig.fairHomeSpread : null,
          fairTotal: null,
          edgeSpread: sig ? sig.edge : null,
          edgeTotal: null,
          bseRating: sig ? sig.rating : null,
          pick: sig && sig.lean !== "none" ? (sig.lean === "home" ? g.home.name : g.away.name) : null,
        }
      })
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())

    const matchedCount = rows.filter((r) => r.oddsStatus === "matched").length

    return {
      ok: true,
      season: ctx.season,
      week: ctx.week,
      seasonType: ctx.seasonType,
      projectionsAvailable: signals.byGameId.size > 0,
      oddsAvailable: matchedCount > 0,
      count: rows.length,
      oddsMatchedCount: matchedCount,
      oddsUnmatchedCount: rows.length - matchedCount,
      snapshotAt: snapshot?.snapshotAt ?? null,
      previousSnapshotAt: snapshot?.previousSnapshotAt ?? null,
      games: rows,
    }
  } catch (error) {
    console.error("CFBD board failed:", error)
    return { ok: false, status: 500, error: error instanceof Error ? error.message : "Unknown error" }
  }
}
