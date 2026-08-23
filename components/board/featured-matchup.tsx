"use client"

import Link from "next/link"
import { ArrowRight, Crown, Lock, Sparkles, Zap } from "lucide-react"
import {
  formatKickoff,
  formatKickoffDate,
  formatFavoredSpread,
  type LiveBoardGame,
} from "@/lib/use-live-board"
import { cardAccessFor } from "@/lib/board-card-state"
import type { AccessResponse } from "@/lib/use-access"
import { TeamName } from "@/components/team-name"
import { BseRatingBadge } from "@/components/board/bse-rating-badge"
import { LockChip } from "@/components/board/lock-chip"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const PLACEHOLDER = "—"

interface FeaturedMatchupProps {
  game: LiveBoardGame
  access: AccessResponse | null
  accessLoading: boolean
  onRequestUnlock: (game: LiveBoardGame) => void
}

/**
 * The BSE Game of the Week — a large hero panel above the Board grid. Same
 * access rules as a card, rendered with more room: bigger BSE Rating, market
 * lines, and a prominent context-aware CTA.
 */
export function FeaturedMatchup({ game, access, accessLoading, onRequestUnlock }: FeaturedMatchupProps) {
  const { state, unlocked } = cardAccessFor(access, accessLoading, game.id)
  const breakdownHref = `/game/${game.id}`
  const spread = formatFavoredSpread(game) ?? PLACEHOLDER
  const total = game.marketTotal != null ? `O/U ${game.marketTotal.toFixed(1)}` : PLACEHOLDER
  const edge =
    game.edgeSpread != null ? `${game.edgeSpread > 0 ? "+" : ""}${game.edgeSpread.toFixed(1)}` : PLACEHOLDER

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-6 sm:p-8"
      aria-label="BSE Game of the Week"
    >
      <div className="pointer-events-none absolute inset-0 radial-fade opacity-60" aria-hidden="true" />
      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1">
          <Zap className="size-3.5 text-primary" />
          <span className="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-primary">
            BSE Game of the Week
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Matchup */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              <span>{formatKickoffDate(game.kickoff)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatKickoff(game.kickoff, game.kickoffTBD)}</span>
              {game.neutralSite && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Neutral site</span>
                </>
              )}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <TeamName name={game.away.name} abbr={game.away.abbr} size="lg" className="text-xl sm:text-2xl" />
              <span className="font-display text-xs uppercase tracking-widest text-muted-foreground">at</span>
              <TeamName name={game.home.name} abbr={game.home.abbr} size="lg" className="text-xl sm:text-2xl" />
            </div>
          </div>

          {/* Rating + lines */}
          <div className="flex items-center gap-8">
            <BseRatingBadge rating={game.bseRating} size="lg" />
            <div className="flex flex-col gap-3">
              <div>
                <span className="block font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                  Spread
                </span>
                <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
                  {spread}
                </span>
              </div>
              <div>
                <span className="block font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                  Total
                </span>
                <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
                  {total}
                </span>
              </div>
              <div>
                <span className="block font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                  Model Edge
                </span>
                {unlocked ? (
                  <span className="font-display text-2xl font-semibold tabular-nums text-primary">{edge}</span>
                ) : (
                  <LockChip label="Model Edge" hint="BSE Edge" className="mt-1" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-7 border-t border-border pt-5">
          {state === "loading" ? (
            <div className="h-12 w-full max-w-xs animate-pulse rounded-lg bg-secondary/60" />
          ) : state === "guest" ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-pretty text-sm text-muted-foreground">
                Want to see what BSE sees? Create a free account for one full breakdown every week.
              </p>
              <Link
                href={`/signup?next=${encodeURIComponent(breakdownHref)}`}
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "min-h-12 gap-2 px-6 font-display font-semibold uppercase tracking-wide",
                )}
              >
                <Sparkles className="size-4" />
                Create free account
              </Link>
            </div>
          ) : state === "rookie-available" ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-pretty text-sm text-muted-foreground">
                Spend your free weekly breakdown on this game, or browse the Board first.
              </p>
              <Button
                onClick={() => onRequestUnlock(game)}
                className="min-h-12 gap-2 px-6 font-display font-semibold uppercase tracking-wide"
              >
                <Lock className="size-4" />
                Unlock this breakdown
              </Button>
            </div>
          ) : state === "rookie-used-other" ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-pretty text-sm text-muted-foreground">
                You&apos;ve used this week&apos;s free breakdown. Go Pro to unlock every game.
              </p>
              <Link
                href="/pricing"
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  "min-h-12 gap-2 px-6 font-display font-semibold uppercase tracking-wide",
                )}
              >
                <Crown className="size-4" />
                Go Pro
              </Link>
            </div>
          ) : (
            <Link
              href={breakdownHref}
              className={cn(
                buttonVariants({ variant: "default" }),
                "min-h-12 w-full gap-2 px-6 font-display font-semibold uppercase tracking-wide sm:w-auto",
              )}
            >
              View full breakdown
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
