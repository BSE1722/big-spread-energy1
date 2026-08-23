"use client"

import { useMemo, useState } from "react"
import { ArrowDownUp } from "lucide-react"
import { useLiveBoard, type LiveBoardGame } from "@/lib/use-live-board"
import { useAccess } from "@/lib/use-access"
import { MatchupCard } from "@/components/board/matchup-card"
import { FeaturedMatchup } from "@/components/board/featured-matchup"
import { AccessBanner } from "@/components/board/access-banner"
import { UnlockDialog } from "@/components/board/unlock-dialog"
import { cn } from "@/lib/utils"

type SortKey = "rating" | "kickoff"

/**
 * The Board. Everyone sees every game, its market lines, and its BSE Rating.
 * Premium intelligence (Model Edge, full breakdown) is gated per viewer:
 * guests sign up, Rookies spend one weekly unlock, Pro sees everything.
 */
export function BoardView() {
  const [sort, setSort] = useState<SortKey>("kickoff")
  const { games, week, loading, error } = useLiveBoard()
  const { access, loading: accessLoading, refresh: refreshAccess } = useAccess()

  // The game a Rookie is about to spend their weekly breakdown on (confirm modal).
  const [pendingUnlock, setPendingUnlock] = useState<LiveBoardGame | null>(null)

  const rows = useMemo(() => {
    const list = [...games]
    if (sort === "rating") {
      list.sort((a, b) => (b.bseRating ?? -Infinity) - (a.bseRating ?? -Infinity))
    } else {
      list.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    }
    return list
  }, [games, sort])

  // "Featured" = the highest real BSE Rating this week (deterministic, never
  // fabricated). When no ratings exist yet, fall back to the first game by
  // kickoff so the panel still highlights a real matchup. Featured does NOT
  // imply free or locked — it's purely an editorial highlight.
  const featured = useMemo<LiveBoardGame | null>(() => {
    if (games.length === 0) return null
    const rated = games.filter((g) => g.bseRating != null)
    if (rated.length > 0) {
      return rated.reduce((best, g) => ((g.bseRating ?? 0) > (best.bseRating ?? 0) ? g : best))
    }
    return [...games].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())[0]
  }, [games])

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Main column */}
      <div className="min-w-0 flex-1">
        <AccessBanner access={access} loading={accessLoading} />

        {/* Controls */}
        <div className="mt-4 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
            {loading
              ? "Loading live games…"
              : `${rows.length} game${rows.length === 1 ? "" : "s"}${week ? ` · Week ${week}` : ""}`}
          </p>
          <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <ArrowDownUp className="size-4 text-muted-foreground" />
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-transparent font-display text-sm font-semibold uppercase tracking-wide text-foreground outline-none"
            >
              <option value="kickoff">Kickoff</option>
              <option value="rating">BSE Rating</option>
            </select>
          </label>
        </div>

        {/* States */}
        {error && !loading && (
          <p className="mt-6 font-mono text-sm text-destructive">
            {`Unable to load live games: ${error}`}
          </p>
        )}
        {!loading && !error && rows.length === 0 && (
          <p className="mt-6 font-mono text-sm text-muted-foreground">
            No games scheduled for this week yet.
          </p>
        )}

        {/* Board cards */}
        {rows.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {rows.map((g) => (
              <MatchupCard
                key={g.id}
                game={g}
                access={access}
                accessLoading={accessLoading}
                onRequestUnlock={setPendingUnlock}
              />
            ))}
          </div>
        )}
      </div>

      {/* Featured rail (desktop) / stacked (mobile handled by order) */}
      <aside className={cn("w-full lg:w-80 lg:shrink-0", "lg:sticky lg:top-6")}>
        {featured && (
          <FeaturedMatchup
            game={featured}
            access={access}
            accessLoading={accessLoading}
            onRequestUnlock={setPendingUnlock}
          />
        )}
      </aside>

      {/* Rookie unlock confirmation */}
      <UnlockDialog
        game={pendingUnlock}
        onClose={() => setPendingUnlock(null)}
        onUnlocked={() => {
          setPendingUnlock(null)
          refreshAccess()
        }}
      />
    </div>
  )
}
