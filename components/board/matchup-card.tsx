"use client"

import Link from "next/link"
import { ArrowRight, Check, Crown, Lock, Sparkles } from "lucide-react"
import {
  formatKickoff,
  formatKickoffDate,
  formatFavoredSpread,
  type LiveBoardGame,
} from "@/lib/use-live-board"
import { cardAccessFor, type CardState } from "@/lib/board-card-state"
import type { AccessResponse } from "@/lib/use-access"
import { TeamName } from "@/components/team-name"
import { BseRatingBadge } from "@/components/board/bse-rating-badge"
import { LockChip } from "@/components/board/lock-chip"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const PLACEHOLDER = "—"

interface MatchupCardProps {
  game: LiveBoardGame
  access: AccessResponse | null
  accessLoading: boolean
  /** Called when a Rookie taps "Unlock this game" (opens the confirm dialog). */
  onRequestUnlock: (game: LiveBoardGame) => void
}

function marketLine(game: LiveBoardGame): string {
  return formatFavoredSpread(game) ?? PLACEHOLDER
}

function totalLine(game: LiveBoardGame): string {
  return game.marketTotal != null ? `O/U ${game.marketTotal.toFixed(1)}` : PLACEHOLDER
}

/** The one action per card, driven entirely by the viewer's state. */
function CardAction({
  state,
  gameId,
  onUnlock,
}: {
  state: CardState
  gameId: string
  onUnlock: () => void
}) {
  const breakdownHref = `/game/${gameId}`
  const base = "min-h-11 w-full gap-1.5 px-4 font-display font-semibold uppercase tracking-wide sm:w-auto"

  switch (state) {
    case "loading":
      return <div className="h-11 w-full animate-pulse rounded-lg bg-secondary/60 sm:w-32" />
    case "guest":
      return (
        <Link
          href={`/signup?next=${encodeURIComponent(breakdownHref)}`}
          className={cn(buttonVariants({ variant: "default" }), base)}
        >
          <Sparkles className="size-4" />
          Create free account
        </Link>
      )
    case "rookie-available":
      return (
        <Button onClick={onUnlock} className={base}>
          <Lock className="size-4" />
          Unlock this game
        </Button>
      )
    case "rookie-used-other":
      return (
        <Link href="/pricing" className={cn(buttonVariants({ variant: "secondary" }), base)}>
          <Crown className="size-4" />
          Go Pro for full access
        </Link>
      )
    case "rookie-unlocked":
    case "pro":
      return (
        <Link href={breakdownHref} className={cn(buttonVariants({ variant: "outline" }), base)}>
          View full breakdown
          <ArrowRight className="size-4" />
        </Link>
      )
  }
}

/**
 * A single game on the Board. Public info (matchup, kickoff, market lines, BSE
 * Rating) is always visible; premium intelligence (Model Edge) is shown only
 * when the viewer has unlocked this game, otherwise a tasteful lock chip.
 */
export function MatchupCard({ game, access, accessLoading, onRequestUnlock }: MatchupCardProps) {
  const { state, unlocked } = cardAccessFor(access, accessLoading, game.id)

  const edgeValue =
    game.edgeSpread != null ? `${game.edgeSpread > 0 ? "+" : ""}${game.edgeSpread.toFixed(1)}` : PLACEHOLDER

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card p-4 transition-colors sm:p-5",
        state === "rookie-unlocked"
          ? "border-primary/40"
          : "border-border hover:border-border/80",
      )}
    >
      {state === "rookie-unlocked" && (
        <span className="absolute -top-2 left-4 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-card px-2 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-primary">
          <Check className="size-3" /> Your pick this week
        </span>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: matchup + kickoff */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            <span>{formatKickoffDate(game.kickoff)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatKickoff(game.kickoff, game.kickoffTBD)}</span>
            {game.neutralSite && (
              <>
                <span aria-hidden="true">·</span>
                <span>Neutral</span>
              </>
            )}
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            <TeamName name={game.away.name} abbr={game.away.abbr} size="sm" />
            <TeamName name={game.home.name} abbr={game.home.abbr} size="sm" />
          </div>
        </div>

        {/* Middle: market data (always public) */}
        <div className="flex items-center gap-6 sm:gap-8">
          <div className="flex flex-col">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              Spread
            </span>
            <span className="font-display text-lg font-semibold tabular-nums text-foreground">
              {marketLine(game)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              Total
            </span>
            <span className="font-display text-lg font-semibold tabular-nums text-foreground">
              {totalLine(game)}
            </span>
          </div>

          {/* Model Edge — premium */}
          <div className="flex flex-col">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              Model Edge
            </span>
            {unlocked ? (
              <span className="font-display text-lg font-semibold tabular-nums text-primary">
                {edgeValue}
              </span>
            ) : (
              <LockChip label="Model Edge" hint="BSE" className="mt-0.5" />
            )}
          </div>
        </div>

        {/* Right: BSE Rating + action */}
        <div className="flex items-center justify-between gap-4 border-t border-border pt-4 sm:justify-end sm:border-0 sm:pt-0">
          <BseRatingBadge rating={game.bseRating} size="sm" />
          <div className="w-full sm:w-auto">
            <CardAction state={state} gameId={game.id} onUnlock={() => onRequestUnlock(game)} />
          </div>
        </div>
      </div>
    </div>
  )
}
