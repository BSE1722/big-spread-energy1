"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import {
  useLiveBoard,
  formatKickoff,
  formatKickoffDate,
  formatFavoredSpread,
  type LiveBoardGame,
} from "@/lib/use-live-board"
import { TeamName } from "@/components/team-name"
import { evaluateGame } from "@/lib/parlay/generate"

const PLACEHOLDER = "—"

/**
 * The real current-week slate, shared by both parlay tools. Every game and
 * market line comes from the live board (/api/cfbd-board), so this advances
 * automatically with the active week. It shows only real market data and grades
 * each game through the SAME per-game read the ticket generator uses (no
 * fabricated legs, ratings, probabilities, or EV): "Awaiting BSE Grade" when no
 * projection exists, "No BSE edge" when a projection exists but misses the gate,
 * and the real spread edge when it qualifies.
 */
export function CurrentWeekSlate() {
  const { games, week, projectionsAvailable, loading, error } = useLiveBoard()

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-secondary/40" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm text-destructive">
        {`Unable to load this week's games: ${error}`}
      </p>
    )
  }

  if (games.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm text-muted-foreground">
        No games are scheduled for this week yet.
      </p>
    )
  }

  const rows = [...games].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  )

  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          {week ? `Week ${week} slate` : "Current-week slate"}
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {`${rows.length} game${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((g) => (
          <SlateRow key={g.id} game={g} projectionsAvailable={projectionsAvailable} />
        ))}
      </ul>
    </div>
  )
}

function SlateRow({
  game,
  projectionsAvailable,
}: {
  game: LiveBoardGame
  projectionsAvailable: boolean
}) {
  const spread = formatFavoredSpread(game) ?? PLACEHOLDER
  const total = game.marketTotal != null ? `O/U ${game.marketTotal.toFixed(1)}` : PLACEHOLDER

  // Grade this game through the SAME read the ticket generator uses so the
  // badge never drifts from the tickets. Three real states, no fabrication.
  const read = evaluateGame(game)
  const showGrade = projectionsAvailable && read.hasProjection

  return (
    <li>
      <Link
        href={`/game/${game.id}`}
        className="group flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-card sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            <span>{formatKickoffDate(game.kickoff)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatKickoff(game.kickoff, game.kickoffTBD)}</span>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            <TeamName name={game.away.name} abbr={game.away.abbr} size="sm" />
            <TeamName name={game.home.name} abbr={game.home.abbr} size="sm" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-6 border-t border-border pt-3 sm:justify-end sm:border-0 sm:pt-0 sm:gap-8">
          <Stat label="Spread" value={spread} />
          <Stat label="Total" value={total} />
          <SlateBadge showGrade={showGrade} read={read} />
          <ArrowRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
        </div>
      </Link>
    </li>
  )
}

function SlateBadge({
  showGrade,
  read,
}: {
  showGrade: boolean
  read: ReturnType<typeof evaluateGame>
}) {
  // 1. No projection published yet → honest pending state.
  if (!showGrade) {
    return (
      <span className="hidden rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground sm:inline-block">
        Awaiting BSE Grade
      </span>
    )
  }

  // 2. Projection exists and clears the edge gate → real qualifying read.
  if (read.eligible && read.lineEdge != null) {
    const edge = `${read.lineEdge > 0 ? "+" : ""}${read.lineEdge.toFixed(1)}`
    return (
      <span className="hidden rounded border border-[var(--rating-strong)]/40 bg-[var(--rating-strong)]/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-[var(--rating-strong)] sm:inline-block">
        {`BSE ${read.pickedTeamAbbr} ${edge}`}
      </span>
    )
  }

  // 3. Projection exists but misses the gate → non-eligible state.
  return (
    <span className="hidden rounded border border-border bg-secondary/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground sm:inline-block">
      No BSE edge
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-display text-lg font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}
