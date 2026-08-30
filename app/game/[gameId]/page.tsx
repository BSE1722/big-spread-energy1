import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getCurrentContext } from "@/lib/bse/season"
import { getCfbdGameLites } from "@/lib/board-build"
import { loadSnapshot } from "@/lib/odds-snapshot"
import { getAccessState, canViewBreakdown } from "@/lib/access"
import { getBoardSignalForGame } from "@/lib/board-signal/service"
import { describeSignal, type SignalDescription } from "@/lib/bse/model-signal"
import type { GameWithOdds } from "@/lib/odds-match"
import { BreakdownHeader } from "@/components/breakdown/breakdown-header"
import { BreakdownLocked } from "@/components/breakdown/breakdown-locked"
import { BreakdownFull } from "@/components/breakdown/breakdown-full"

export const dynamic = "force-dynamic"

/**
 * The full BSE breakdown for a single game. Authorization happens HERE on the
 * server (getAccessState + canViewBreakdown), so premium analysis is never sent
 * to the client for a viewer who hasn't unlocked it — hiding UI is not the gate.
 *
 * Data honesty: market data comes from the frozen snapshot (real). The BSE
 * spread read comes from the FROZEN model's display cache and is labeled
 * in-validation. When a game has no signal yet, model sections render an honest
 * "pending" state — we never fabricate ratings, edges, or picks.
 */
export default async function GameBreakdownPage({
  params,
}: {
  params: Promise<{ gameId: string }>
}) {
  const { gameId } = await params
  const ctx = getCurrentContext()

  const cfbdGames = await getCfbdGameLites(ctx).catch(() => [])
  const game = cfbdGames.find((g) => g.id === gameId) ?? null
  if (!game) notFound()

  const access = await getAccessState()
  const allowed = canViewBreakdown(access, gameId)

  // Public header data (always safe to show).
  const snapshot = await loadSnapshot().catch(() => null)
  const snap: GameWithOdds | undefined = snapshot?.games.find((s) => s.cfbdId === gameId)
  const matched = snap?.oddsStatus === "matched"
  const m = snap?.market
  const marketTotal =
    matched && m && m.total.points != null && m.total.withinPlausibleRange ? m.total.points : null

  // Frozen-model read (display cache). Absent -> the header shows "— / No
  // rating" and the unlocked view shows an honest "signal pending" state.
  const { signal: sig } = await getBoardSignalForGame(game.season, game.week, gameId).catch(() => ({
    signal: null,
  }))
  const signal: SignalDescription | null = sig ? describeSignal(sig, game.home.name, game.away.name) : null

  const header = {
    away: { name: game.away.name, abbr: game.away.abbr },
    home: { name: game.home.name, abbr: game.home.abbr },
    kickoff: game.kickoff,
    kickoffTBD: game.kickoffTBD,
    neutralSite: game.neutralSite,
    marketSpread: matched && m ? m.spread.home : null,
    marketTotal,
    marketMoneyline: { home: m?.moneyline.home ?? null, away: m?.moneyline.away ?? null },
    bseRating: signal ? signal.rating : (null as number | null),
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <Link
          href="/board"
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to the Board
        </Link>

        <BreakdownHeader header={header} unlocked={allowed} viaRookie={allowed && access.tier === "rookie"} />

        {allowed ? (
          <BreakdownFull
            lineHistory={snap?.lineHistory ?? null}
            signal={signal}
            marketSpreadHome={header.marketSpread}
            homeTeam={game.home.name}
            awayTeam={game.away.name}
          />
        ) : (
          <BreakdownLocked
            tier={access.tier}
            canUnlockThisWeek={access.canUnlockThisWeek}
            usedOtherGame={access.tier === "rookie" && access.weeklyUnlock != null}
            gameId={gameId}
          />
        )}
    </main>
  )
}
