"use client"

import Link from "next/link"
import { Flame, TrendingUp, CalendarClock, ArrowRight } from "lucide-react"
import { useLiveBoard, formatKickoff, formatKickoffDate, type LiveBoardGame } from "@/lib/use-live-board"
import {
  topDisagreements,
  topRatings,
  nextKickoffs,
  formatFavoredHomeRel,
  type HomeSignal,
} from "@/lib/home-signals"
import { TeamName } from "@/components/team-name"
import { BseRatingBadge } from "@/components/board/bse-rating-badge"
import { LiveDot } from "@/components/home/bse-alert"

/**
 * SATURDAY COMMAND CENTER — the "SEE BSE" surface. It reorganizes the SAME live
 * board into broadcast-style categories. A category only renders when its
 * underlying data exists: Hot Board and Top Ratings need real model output;
 * Next Kickoffs needs only the schedule. Line Movers and Weather Watch are
 * intentionally absent because the board feed does not carry that data — we
 * don't build a category we can't back. Every row links into the real breakdown.
 */
export function CommandCenter() {
  const { games, week, loading, error } = useLiveBoard()

  const disagreements = topDisagreements(games, 4)
  const ratings = topRatings(games, 4)
  const kickoffs = nextKickoffs(games, 4)

  return (
    <section className="border-b border-border/60 bg-background py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 font-mono text-[0.625rem] font-bold uppercase tracking-[0.18em] text-primary">
              <LiveDot />
              {week ? `Week ${week} · Live` : "Live"}
            </span>
            <h2 className="mt-2 font-display text-4xl font-bold uppercase leading-[0.9] tracking-tight text-foreground sm:text-5xl">
              Saturday Command Center
            </h2>
            <p className="mt-2 max-w-md font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              The market is moving. <span className="text-primary">BSE is watching.</span>
            </p>
          </div>
          <Link
            href="/board"
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md border border-border px-4 font-display text-xs font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            View Full Board <ArrowRight className="h-4 w-4" />
          </Link>
        </header>

        {loading && <p className="font-mono text-sm text-muted-foreground">Loading the live slate…</p>}
        {error && !loading && games.length === 0 && (
          <p className="font-mono text-sm text-muted-foreground">
            The live board is refreshing. Open{" "}
            <Link href="/board" className="text-primary underline-offset-2 hover:underline">
              The Board
            </Link>{" "}
            for every matchup.
          </p>
        )}

        {!loading && games.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-3">
            {disagreements.length > 0 && (
              <Category icon={Flame} title="Hot Board" subtitle="Biggest BSE disagreement">
                {disagreements.map((s) => (
                  <DisagreementRow key={s.game.id} signal={s} />
                ))}
              </Category>
            )}

            {ratings.length > 0 && (
              <Category icon={TrendingUp} title="Top BSE Ratings" subtitle="Highest-rated matchups">
                {ratings.map((g) => (
                  <RatingRow key={g.id} game={g} />
                ))}
              </Category>
            )}

            <Category icon={CalendarClock} title="Next Kickoffs" subtitle="On the clock">
              {kickoffs.map((g) => (
                <KickoffRow key={g.id} game={g} />
              ))}
            </Category>
          </div>
        )}
      </div>
    </section>
  )
}

function Category({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Flame
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div>
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">{title}</h3>
          <p className="font-mono text-[0.625rem] uppercase tracking-wide text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-border/60">{children}</div>
    </div>
  )
}

function RowShell({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Link
      href={`/game/${id}`}
      className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/40"
    >
      {children}
    </Link>
  )
}

function DisagreementRow({ signal }: { signal: HomeSignal }) {
  const { game } = signal
  return (
    <RowShell id={game.id}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1">
          <TeamName name={game.away.name} abbr={game.away.abbr} label="abbr" size="sm" />
          <TeamName name={game.home.name} abbr={game.home.abbr} label="abbr" size="sm" />
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">Edge</span>
        <span className="font-display text-xl font-bold tabular-nums text-primary text-glow">
          +{signal.absGap.toFixed(1)}
        </span>
        <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          {signal.valueTeam.abbr}
        </span>
      </div>
    </RowShell>
  )
}

function RatingRow({ game }: { game: LiveBoardGame }) {
  return (
    <RowShell id={game.id}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1">
          <TeamName name={game.away.name} abbr={game.away.abbr} label="abbr" size="sm" />
          <TeamName name={game.home.name} abbr={game.home.abbr} label="abbr" size="sm" />
        </div>
      </div>
      <BseRatingBadge rating={game.bseRating} size="sm" />
    </RowShell>
  )
}

function KickoffRow({ game }: { game: LiveBoardGame }) {
  const spread =
    game.marketSpread != null
      ? (() => {
          const f = formatFavoredHomeRel(game.marketSpread, game.home, game.away)
          return f.line === "PK" ? "PK" : `${f.abbr} ${f.line}`
        })()
      : "—"
  return (
    <RowShell id={game.id}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1">
          <TeamName name={game.away.name} abbr={game.away.abbr} label="abbr" size="sm" />
          <TeamName name={game.home.name} abbr={game.home.abbr} label="abbr" size="sm" />
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
          {formatKickoffDate(game.kickoff)}
        </span>
        <span className="font-display text-sm font-semibold text-foreground">
          {formatKickoff(game.kickoff, game.kickoffTBD)}
        </span>
        <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">{spread}</span>
      </div>
    </RowShell>
  )
}
