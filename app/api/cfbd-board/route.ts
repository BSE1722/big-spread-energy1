import { NextRequest, NextResponse } from "next/server"
import { getCurrentContext } from "@/lib/bse/season"
import { getCfbdGameLites } from "@/lib/board-build"
import { loadSnapshot } from "@/lib/odds-snapshot"
import type { GameWithOdds } from "@/lib/odds-match"

/**
 * Live board feed for The Board + homepage Top Edges.
 *
 * SOURCE OF TRUTH SPLIT:
 *   - CFBD  → schedule, teams, kickoff times, IDs, game identity (fetched live).
 *   - SGO/DraftKings → betting markets ONLY, read from the FROZEN manual
 *     snapshot. This route NEVER calls SportsGameOdds; visitors can't move the
 *     lines. Odds change only when an admin triggers a refresh (see /admin →
 *     /api/admin/refresh-odds), which rewrites the stored snapshot.
 *
 * We attach a DraftKings line to a CFBD game only when the saved snapshot has a
 * confident match for that game id. Otherwise odds render as unavailable — we
 * never fabricate, infer, or substitute a line.
 *
 * Projection / edge / rating fields remain null placeholders: the BSE model
 * output is intentionally NOT wired here yet.
 */

// Cache is driven by the snapshot, not by time. Keep the schedule fresh but do
// not let this route perform any background odds revalidation.
export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest) {
  try {
    const ctx = getCurrentContext()

    // CFBD schedule (source of truth, live) + the frozen odds snapshot (durable
    // storage, NO upstream odds call). Snapshot read failure must never break
    // the schedule, so it is handled independently.
    const [cfbdGames, snapshot] = await Promise.all([
      getCfbdGameLites(ctx),
      loadSnapshot().catch((err) => {
        console.error("[v0] snapshot load failed; rendering schedule without odds:", err)
        return null
      }),
    ])

    // Frozen odds indexed by CFBD game id.
    const oddsById = new Map<string, GameWithOdds>()
    if (snapshot) for (const g of snapshot.games) oddsById.set(g.cfbdId, g)

    const rows = cfbdGames
      .map((g) => {
        const snap = oddsById.get(g.id)
        const matched = snap?.oddsStatus === "matched"
        const m = snap?.market

        // A flagged (implausible) total is treated as unavailable for display,
        // but the raw value + flag stay preserved in the audit block below.
        const marketTotal =
          matched && m && m.total.points != null && m.total.withinPlausibleRange
            ? m.total.points
            : null

        return {
          id: g.id,
          season: g.season,
          week: g.week,
          kickoff: g.kickoff,
          kickoffTBD: g.kickoffTBD,
          neutralSite: g.neutralSite,
          away: { name: g.away.name, abbr: g.away.abbr },
          home: { name: g.home.name, abbr: g.home.abbr },

          // Frozen DraftKings markets from the snapshot. Home-relative spread;
          // null = unavailable. oddsStatus falls back to unavailable when the
          // snapshot has no confident match (or no snapshot exists yet).
          marketSpread: matched && m ? m.spread.home : null,
          marketTotal,
          marketMoneyline: {
            home: m?.moneyline.home ?? null,
            away: m?.moneyline.away ?? null,
          },
          oddsStatus: snap?.oddsStatus ?? "unavailable",

          // Internal audit metadata (traceability), preserved end-to-end.
          odds: {
            bookmaker: m?.bookmaker ?? "draftkings",
            sgoEventID: snap?.sgoEventID ?? null,
            sourceOddIDs: m?.sourceOddIDs ?? { spread: null, moneyline: null, total: null },
            updatedAt: m?.updatedAt ?? null,
            totalWithinPlausibleRange: m?.total.withinPlausibleRange ?? true,
            rawTotalPoints: m?.total.points ?? null,
            lineHistory: snap?.lineHistory ?? null,
          },

          // BSE model output — intentionally null until the engine is wired.
          fairSpread: null as number | null,
          fairTotal: null as number | null,
          edgeSpread: null as number | null,
          edgeTotal: null as number | null,
          bseRating: null as number | null,
          pick: null as string | null,
        }
      })
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())

    const matchedCount = rows.filter((r) => r.oddsStatus === "matched").length

    return NextResponse.json({
      ok: true,
      season: ctx.season,
      week: ctx.week,
      seasonType: ctx.seasonType,
      projectionsAvailable: false,
      oddsAvailable: matchedCount > 0,
      count: rows.length,
      oddsMatchedCount: matchedCount,
      oddsUnmatchedCount: rows.length - matchedCount,
      // Snapshot provenance so the UI/admin can show when lines were last set.
      snapshotAt: snapshot?.snapshotAt ?? null,
      previousSnapshotAt: snapshot?.previousSnapshotAt ?? null,
      games: rows,
    })
  } catch (error) {
    console.error("CFBD board failed:", error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
