"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useLiveBoard } from "@/lib/use-live-board"
import {
  heroSignal,
  formatFavoredHomeRel,
  formatEdge,
  bookLabel,
  type HomeSignal,
} from "@/lib/home-signals"
import { TeamName } from "@/components/team-name"
import { BseRatingBadge } from "@/components/board/bse-rating-badge"
import { BseAlert, LiveDot } from "@/components/home/bse-alert"

/**
 * The above-the-fold LIVE BSE SIGNAL. Pulls the single most interesting current
 * matchup from the live board (largest BSE-vs-market disagreement among rated
 * games) and shows the real DraftKings line, the real BSE fair line, the gap,
 * and the real 0–100 rating. Nothing is hardcoded. When no rated signal exists
 * yet it gracefully shows the brand card instead of inventing one.
 */
export function HeroLiveSignal() {
  const { games, week, loading, error } = useLiveBoard()
  const signal = heroSignal(games)

  return (
    <div className="animate-signal-in relative w-full max-w-md rounded-2xl border border-primary/25 bg-card/80 p-1 shadow-[0_0_60px_oklch(0.86_0.24_148_/_0.14)] ring-1 ring-primary/10 backdrop-blur">
      <div className="rounded-[0.85rem] bg-card">
        {/* Broadcast header */}
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <span className="inline-flex items-center gap-2 font-mono text-[0.625rem] font-bold uppercase tracking-[0.18em] text-primary">
            <LiveDot />
            Live BSE Signal
          </span>
          <span className="font-display text-[0.625rem] font-bold uppercase tracking-widest text-muted-foreground">
            {week ? `Week ${week}` : "The Board"}
          </span>
        </div>

        {loading && !signal && <SignalSkeleton />}
        {!loading && !signal && <SignalFallback error={error} />}
        {signal && <SignalBody signal={signal} />}
      </div>
    </div>
  )
}

function SignalBody({ signal }: { signal: HomeSignal }) {
  const { game } = signal
  const market = formatFavoredHomeRel(signal.marketSpread, game.home, game.away)
  const fair = formatFavoredHomeRel(signal.fairSpread, game.home, game.away)
  const highRating = signal.rating != null && signal.rating >= 80

  return (
    <div className="px-4 py-4">
      {/* Matchup */}
      <div className="flex flex-col gap-1.5">
        <TeamName name={game.away.name} abbr={game.away.abbr} size="sm" />
        <TeamName name={game.home.name} abbr={game.home.abbr} size="sm" />
      </div>

      {/* Their line / Our line / Edge */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <LineBlock label={bookLabel(game.odds?.bookmaker)} value={market.line} sub={market.abbr} />
        <LineBlock label="BSE Fair" value={fair.line} sub={fair.abbr} accent />
        <div className="flex flex-col items-center justify-center rounded-lg border border-primary/30 bg-primary/5 px-1 py-2">
          <span className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-foreground">
            BSE Edge
          </span>
          <span className="font-display text-2xl font-bold tabular-nums text-primary text-glow">
            {formatEdge(signal.absGap)}
          </span>
        </div>
      </div>

      {/* Rating + verdict line */}
      <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-4">
        <div className="flex items-center gap-3">
          <BseRatingBadge rating={signal.rating} size="sm" />
          <div className="flex flex-wrap gap-1.5">
            {signal.disagrees && <BseAlert tone="disagreement" />}
            {highRating && <BseAlert tone="rating" />}
          </div>
        </div>
      </div>

      <p className="mt-4 font-display text-lg font-bold uppercase leading-none tracking-tight text-foreground">
        {signal.disagrees ? (
          <>
            The Machine <span className="text-primary text-glow">Disagrees.</span>
          </>
        ) : (
          <>
            BSE &amp; The Market <span className="text-primary">Agree.</span>
          </>
        )}
      </p>

      <Link
        href={`/game/${game.id}`}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 font-display text-xs font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
      >
        See What BSE Sees <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

function LineBlock({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-secondary/40 px-1 py-2">
      <span className="max-w-full truncate font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span
        className={`font-display text-2xl font-bold tabular-nums ${accent ? "text-foreground" : "text-foreground"}`}
      >
        {value}
      </span>
      {sub && (
        <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          {sub}
        </span>
      )}
    </div>
  )
}

function SignalSkeleton() {
  return (
    <div className="space-y-4 px-4 py-6">
      <div className="space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-secondary" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="h-16 animate-pulse rounded-lg bg-secondary" />
        <div className="h-16 animate-pulse rounded-lg bg-secondary" />
        <div className="h-16 animate-pulse rounded-lg bg-secondary" />
      </div>
      <div className="h-11 w-full animate-pulse rounded-md bg-secondary" />
    </div>
  )
}

function SignalFallback({ error }: { error: string | null }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
      <span className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
        The Board Is Loading
      </span>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {error
          ? "The live signal is refreshing. Open the Board for every matchup, line, and BSE rating."
          : "Live BSE signals publish before kickoff. Open the Board for every matchup, line, and BSE rating."}
      </p>
      <Link
        href="/board"
        className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border font-display text-xs font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary"
      >
        See The Board
      </Link>
    </div>
  )
}
