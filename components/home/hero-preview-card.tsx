"use client"

import Link from "next/link"
import { Menu } from "lucide-react"
import {
  useLiveBoard,
  formatFavoredSpread,
  type LiveBoardGame,
} from "@/lib/use-live-board"
import { topBoardGames } from "@/lib/home-top-games"
import { TeamName } from "@/components/team-name"
import { BseRatingBadge } from "@/components/board/bse-rating-badge"

const PLACEHOLDER = "—"

/**
 * The hero "phone" preview. It shows a REAL current-week featured matchup from
 * the live board — matchup, kickoff week, and real DraftKings market lines.
 * The BSE Rating and any model fields render their honest "no rating yet" state
 * until the model produces output; nothing is ever fabricated here.
 */
export function HeroPreviewCard() {
  const { games, week, projectionsAvailable, loading, error } = useLiveBoard()
  const featured = topBoardGames(games, projectionsAvailable, 1)[0] ?? null

  return (
    <div className="w-full max-w-[290px] rounded-[2.2rem] border border-border bg-card p-2 shadow-[0_0_50px_oklch(0_0_0_/_0.6)] ring-1 ring-primary/10">
      <div className="overflow-hidden rounded-[1.7rem] bg-secondary">
        {/* phone header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-1">
            <span className="font-display text-lg font-bold text-foreground">BS</span>
            <span className="font-display text-lg font-bold text-primary">E</span>
          </div>
          <span className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {week ? `Week ${week}` : "The Board"}
          </span>
          <Menu className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>

        {loading && <PhoneSkeleton />}

        {!loading && (error || !featured) && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              The Board
            </span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              Every matchup. Every line. One BSE rating.
            </span>
            <Link
              href="/board"
              className="mt-2 block w-full rounded-md border border-border py-2.5 text-center font-display text-xs font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              See The Board
            </Link>
          </div>
        )}

        {!loading && !error && featured && <PhoneGame game={featured} />}
      </div>
    </div>
  )
}

function PhoneGame({ game }: { game: LiveBoardGame }) {
  const spread = formatFavoredSpread(game) ?? PLACEHOLDER
  const total = game.marketTotal != null ? `O/U ${game.marketTotal.toFixed(1)}` : PLACEHOLDER

  return (
    <>
      {/* BSE Rating — real value or honest "no rating yet" */}
      <div className="flex flex-col items-center px-4 py-6 text-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          BSE Rating
        </span>
        <div className="my-1">
          <BseRatingBadge rating={game.bseRating} size="lg" />
        </div>
      </div>

      {/* Real featured matchup + real market lines */}
      <div className="border-t border-border/60 px-4 py-4">
        <div className="flex flex-col gap-1">
          <TeamName name={game.away.name} abbr={game.away.abbr} size="sm" />
          <TeamName name={game.home.name} abbr={game.home.abbr} size="sm" />
        </div>
        <span className="mt-2 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Featured matchup
        </span>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Market Spread" value={spread} />
          <Row label="Total" value={total} />
          <div className="flex items-center justify-between border-t border-border/60 pt-2">
            <dt className="font-semibold text-muted-foreground">Model Edge</dt>
            <dd className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              {game.edgeSpread == null ? "No rating yet" : `${game.edgeSpread > 0 ? "+" : ""}${game.edgeSpread.toFixed(1)}`}
            </dd>
          </div>
        </dl>
        <Link
          href={`/game/${game.id}`}
          className="mt-4 block w-full rounded-md border border-border py-2.5 text-center font-display text-xs font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary"
        >
          View Full Breakdown
        </Link>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono font-semibold text-foreground">{value}</dd>
    </div>
  )
}

function PhoneSkeleton() {
  return (
    <div className="space-y-4 px-4 py-6">
      <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-background/60" />
      <div className="space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-background/60" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-background/60" />
      </div>
      <div className="h-10 w-full animate-pulse rounded bg-background/60" />
    </div>
  )
}
