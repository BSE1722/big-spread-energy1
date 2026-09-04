import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getAccessState, canViewBreakdown } from "@/lib/access"
import { assembleBreakdown } from "@/lib/breakdown/assemble"
import { BreakdownHeader } from "@/components/breakdown/breakdown-header"
import { BreakdownLocked } from "@/components/breakdown/breakdown-locked"
import { BreakdownFull } from "@/components/breakdown/breakdown-full"

export const dynamic = "force-dynamic"

/**
 * The full BSE breakdown for a single game. Authorization happens HERE on the
 * server (getAccessState + canViewBreakdown), so premium analysis is never sent
 * to the client for a viewer who hasn't unlocked it — hiding UI is not the gate.
 *
 * The entire read is assembled once by `assembleBreakdown` (shared with the API
 * route). Data honesty is enforced there: market data is real, the base number
 * is the FROZEN model, weather impact is computed from real stored forecasts,
 * and injuries/news report DATA UNAVAILABLE rather than fabricating values.
 */
export default async function GameBreakdownPage({
  params,
}: {
  params: Promise<{ gameId: string }>
}) {
  const { gameId } = await params

  const assembled = await assembleBreakdown(gameId)
  if (!assembled.found || !assembled.header) notFound()

  const access = await getAccessState()
  const allowed = canViewBreakdown(access, gameId)
  const header = assembled.header

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href="/board"
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to the Board
      </Link>

      <BreakdownHeader
        header={{
          away: header.away,
          home: header.home,
          kickoff: header.kickoff,
          kickoffTBD: header.kickoffTBD,
          neutralSite: header.neutralSite,
          marketSpread: header.marketSpread,
          marketTotal: header.marketTotal,
          marketMoneyline: header.marketMoneyline,
          bseRating: header.bseRating,
        }}
        unlocked={allowed}
        viaRookie={allowed && access.tier === "rookie"}
      />

      {allowed && assembled.analysis ? (
        <BreakdownFull gameId={gameId} analysis={assembled.analysis} snapshotAt={assembled.snapshotAt} />
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
