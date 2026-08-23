"use client"

import Link from "next/link"
import { useState } from "react"
import {
  Zap,
  LayoutGrid,
  CreditCard,
  LineChart,
  Trophy,
  Calendar,
  ArrowRight,
  Crown,
  Lock,
  Sparkles,
} from "lucide-react"
import {
  useLiveBoard,
  formatKickoff,
  formatKickoffDate,
  formatFavoredSpread,
  type LiveBoardGame,
} from "@/lib/use-live-board"
import { useAccess } from "@/lib/use-access"
import { topBoardGames, hasAnyRating } from "@/lib/home-top-games"
import { TeamName } from "@/components/team-name"
import { BseRatingBadge } from "@/components/board/bse-rating-badge"
import { RatingsTable } from "@/components/board/ratings-table"

const PLACEHOLDER = "—"

const tabs = [
  { id: "edges", label: "Top Edges", icon: Zap },
  { id: "all", label: "All Games", icon: LayoutGrid },
  { id: "card", label: "My Card", icon: CreditCard },
  { id: "trends", label: "Trends", icon: LineChart },
  { id: "ratings", label: "BSE Ratings", icon: Trophy },
] as const

type TabId = (typeof tabs)[number]["id"]

export function TopEdges() {
  const [active, setActive] = useState<TabId>("edges")
  const board = useLiveBoard()
  const { games, week, projectionsAvailable, loading, error } = board

  return (
    <section className="border-b border-border/60 bg-background py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {/* Tabs + week indicator */}
          <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="scrollbar-none flex gap-2 overflow-x-auto" role="tablist" aria-label="Board preview views">
              {tabs.map((t) => {
                const isActive = t.id === active
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActive(t.id)}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3.5 py-2 font-display text-xs font-bold uppercase tracking-wider transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary ring-1 ring-primary/40"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                  </button>
                )
              })}
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-3.5 py-2 font-display text-xs font-bold uppercase tracking-wider text-foreground">
              <Calendar className="h-4 w-4 text-primary" />
              {week ? `Week ${week}` : "Week —"}
            </span>
          </div>

          <div className="p-4 sm:p-6">
            {loading && <p className="font-mono text-sm text-muted-foreground">Loading live games…</p>}
            {error && !loading && (
              <p className="font-mono text-sm text-destructive">{`Unable to load games: ${error}`}</p>
            )}

            {!loading && !error && (
              <>
                {active === "edges" && (
                  <EdgesTab games={games} projectionsAvailable={projectionsAvailable} />
                )}
                {active === "all" && <AllGamesTab games={games} />}
                {active === "card" && <MyCardTab games={games} />}
                {active === "trends" && <TrendsTab week={week} />}
                {active === "ratings" && <RatingsTable />}
              </>
            )}

            <div className="mt-6 text-center">
              <Link
                href="/board"
                className="inline-flex min-h-11 items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-primary hover:text-primary/80"
              >
                View Full Board <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

function EdgesTab({
  games,
  projectionsAvailable,
}: {
  games: LiveBoardGame[]
  projectionsAvailable: boolean
}) {
  const rated = hasAnyRating(games)
  const rows = topBoardGames(games, projectionsAvailable, 3)

  if (rows.length === 0) return <EmptySlate />

  return (
    <>
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
          {rated ? "Top Rated Games" : "BSE Top Rated Games"}
        </h2>
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {rated
            ? "This week's highest BSE-rated matchups"
            : "Ratings publish before kickoff — showing this week's slate"}
        </p>
      </div>
      <div className="space-y-3">
        {rows.map((g) => (
          <HomeGameCard key={g.id} game={g} />
        ))}
      </div>
    </>
  )
}

function AllGamesTab({ games }: { games: LiveBoardGame[] }) {
  if (games.length === 0) return <EmptySlate />
  const rows = [...games].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  )
  return (
    <>
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
          Full Slate
        </h2>
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {`${rows.length} game${rows.length === 1 ? "" : "s"} on the current board`}
        </p>
      </div>
      <div className="space-y-3">
        {rows.map((g) => (
          <HomeGameCard key={g.id} game={g} />
        ))}
      </div>
    </>
  )
}

function MyCardTab({ games }: { games: LiveBoardGame[] }) {
  const { tier, weeklyUnlock, canUnlockThisWeek, loading } = useAccess()

  if (loading) {
    return <div className="h-28 animate-pulse rounded-xl border border-border bg-secondary/40" />
  }

  // Rookie who has unlocked a game this week → show that real game.
  if (tier === "rookie" && weeklyUnlock) {
    const unlockedGame = games.find((g) => g.id === weeklyUnlock.gameId)
    return (
      <>
        <CardHeading title="Your Card This Week" subtitle="The breakdown you unlocked" />
        {unlockedGame ? (
          <HomeGameCard game={unlockedGame} highlight />
        ) : (
          <NoticeCard
            icon={CreditCard}
            title={weeklyUnlock.matchup ?? "Your unlocked game"}
            body="This game is no longer on the current-week board."
          />
        )}
      </>
    )
  }

  // Rookie with a free breakdown still available.
  if (tier === "rookie" && canUnlockThisWeek) {
    return (
      <>
        <CardHeading title="Your Card This Week" subtitle="1 free breakdown available" />
        <NoticeCard
          icon={Lock}
          title="You have 1 free breakdown this week"
          body="Open the Board and unlock any single game's full BSE breakdown. Resets Monday."
          cta={{ href: "/board", label: "Choose a game" }}
        />
      </>
    )
  }

  // Pro → unlimited.
  if (tier === "pro") {
    return (
      <>
        <CardHeading title="Your Card This Week" subtitle="BSE Pro — unlimited access" />
        <NoticeCard
          icon={Crown}
          title="Every breakdown is unlocked"
          body="As a BSE Pro member you have full access to every game on the board."
          cta={{ href: "/board", label: "Open the Board" }}
        />
      </>
    )
  }

  // Guest.
  return (
    <>
      <CardHeading title="Your Card This Week" subtitle="Create a free account to start" />
      <NoticeCard
        icon={Sparkles}
        title="Get 1 free breakdown every week"
        body="Create a free Rookie account to unlock a full BSE breakdown each week, or go Pro for unlimited access."
        cta={{ href: "/signup", label: "Create free account" }}
      />
    </>
  )
}

function TrendsTab({ week }: { week: number | null }) {
  return (
    <>
      <CardHeading
        title="Line & Model Trends"
        subtitle={week ? `Week ${week}` : "Current week"}
      />
      <NoticeCard
        icon={LineChart}
        title="Trends publish with the BSE model"
        body="Line-movement and model-vs-market trends appear here once BSE projections are generated for this week's slate. We don't show trend data before the model has run."
        cta={{ href: "/board", label: "View the Board" }}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Shared building blocks                                              */
/* ------------------------------------------------------------------ */

/** Compact preview card that mirrors the Board's matchup-card visual language. */
function HomeGameCard({ game, highlight }: { game: LiveBoardGame; highlight?: boolean }) {
  const spread = formatFavoredSpread(game) ?? PLACEHOLDER
  const total = game.marketTotal != null ? `O/U ${game.marketTotal.toFixed(1)}` : PLACEHOLDER

  return (
    <Link
      href={`/game/${game.id}`}
      className={`group block rounded-xl border bg-card p-4 transition-colors ${
        highlight ? "border-primary/40" : "border-border hover:border-primary/40"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Matchup + kickoff */}
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

        {/* Market data (always public/real) + rating */}
        <div className="flex items-center justify-between gap-6 border-t border-border pt-3 sm:justify-end sm:border-0 sm:pt-0 sm:gap-8">
          <Stat label="Spread" value={spread} />
          <Stat label="Total" value={total} />
          <BseRatingBadge rating={game.bseRating} size="sm" />
        </div>
      </div>
    </Link>
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

function CardHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <h2 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">{title}</h2>
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function NoticeCard({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: typeof LineChart
  title: string
  body: string
  cta?: { href: string; label: string }
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-secondary/20 p-5">
      <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="font-display text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
      {cta && (
        <Link
          href={cta.href}
          className="inline-flex min-h-11 items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wider text-primary hover:text-primary/80"
        >
          {cta.label} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}

function EmptySlate() {
  return (
    <p className="font-mono text-sm text-muted-foreground">No games scheduled for this week yet.</p>
  )
}
