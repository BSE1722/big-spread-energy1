import { NextResponse, type NextRequest } from "next/server"
import { getCurrentContext } from "@/lib/bse/season"
import { getCfbdGameLites } from "@/lib/board-build"
import { loadSnapshot } from "@/lib/odds-snapshot"
import { getAccessState, canViewBreakdown } from "@/lib/access"
import type { GameWithOdds } from "@/lib/odds-match"

/**
 * Full BSE breakdown for a single game — SERVER-GATED.
 *
 * The premium payload is only assembled and returned when `canViewBreakdown`
 * passes for the current viewer:
 *   - Pro           → any game
 *   - Rookie        → only the one game they unlocked this week
 *   - Guest/others  → 403, with a `locked` flag so the client can show the
 *                     correct upgrade/sign-up state. No premium values leak.
 *
 * Data honesty: market spread/total/moneyline + line movement come from the
 * frozen snapshot (real values). BSE model fields (fair spread, edge, pick,
 * factors, weather, injuries, news, simulation, best line, explanation) are
 * returned as null/unavailable because the model is not wired yet — never
 * fabricated.
 */
export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  const ctx = getCurrentContext()
  const access = await getAccessState()

  // Identify the game from the canonical CFBD schedule.
  const cfbdGames = await getCfbdGameLites(ctx).catch(() => [])
  const game = cfbdGames.find((g) => g.id === gameId) ?? null
  if (!game) {
    return NextResponse.json({ ok: false, error: "Game not found." }, { status: 404 })
  }

  // Public header info every viewer is allowed to see (matchup, kickoff, and
  // the market line + BSE rating that already appear on the Board).
  const snapshot = await loadSnapshot().catch(() => null)
  const snap: GameWithOdds | undefined = snapshot?.games.find((s) => s.cfbdId === gameId)
  const matched = snap?.oddsStatus === "matched"
  const m = snap?.market
  const marketTotal =
    matched && m && m.total.points != null && m.total.withinPlausibleRange ? m.total.points : null

  const header = {
    id: game.id,
    season: game.season,
    week: game.week,
    kickoff: game.kickoff,
    kickoffTBD: game.kickoffTBD,
    neutralSite: game.neutralSite,
    away: { name: game.away.name, abbr: game.away.abbr },
    home: { name: game.home.name, abbr: game.home.abbr },
    marketSpread: matched && m ? m.spread.home : null,
    marketTotal,
    marketMoneyline: { home: m?.moneyline.home ?? null, away: m?.moneyline.away ?? null },
    oddsStatus: snap?.oddsStatus ?? "unavailable",
    // BSE rating is public on the Board; null until the model produces one.
    bseRating: null as number | null,
  }

  // Authorization: only assemble the premium payload if allowed.
  if (!canViewBreakdown(access, gameId)) {
    return NextResponse.json(
      {
        ok: true,
        locked: true,
        tier: access.tier,
        canUnlockThisWeek: access.canUnlockThisWeek,
        weeklyUnlock: access.weeklyUnlock,
        header,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  }

  // Unlocked. Real market intelligence from the snapshot; model fields honestly
  // null/unavailable until the BSE engine is wired.
  const analysis = {
    lineMovement: snap?.lineHistory ?? null,
    bestLine: null,
    fairSpread: null as number | null,
    fairTotal: null as number | null,
    modelEdgeSpread: null as number | null,
    modelEdgeTotal: null as number | null,
    pick: null as string | null,
    factors: [] as { label: string; value: string | number | null }[],
    weather: null as string | null,
    injuries: [] as { team: string; note: string }[],
    news: [] as { headline: string; source: string | null }[],
    simulation: null as { runs: number; homeWinPct: number | null } | null,
    explanation: null as string | null,
    modelAvailable: false,
  }

  return NextResponse.json(
    {
      ok: true,
      locked: false,
      tier: access.tier,
      viaWeeklyUnlock: access.tier === "rookie",
      header,
      analysis,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
