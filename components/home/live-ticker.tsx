"use client"

import { useLiveBoard, formatKickoff } from "@/lib/use-live-board"

export function LiveTicker() {
  const { games, week, loading, error } = useLiveBoard()

  // Duplicate the list so the marquee loops seamlessly.
  const items = games.length ? [...games, ...games] : []

  return (
    <div className="w-full overflow-hidden border-y border-border bg-card">
      {items.length > 0 ? (
        <div className="flex w-max animate-[ticker_40s_linear_infinite] items-center gap-8 py-2.5">
          {items.map((g, i) => (
            <div
              key={`${g.id}-${i}`}
              className="flex items-center gap-2 whitespace-nowrap px-2 font-mono text-xs"
            >
              <span className="text-muted-foreground">{g.away.abbr}</span>
              <span className="text-foreground">@</span>
              <span className="text-muted-foreground">{g.home.abbr}</span>
              <span className="text-foreground/70">{formatKickoff(g.kickoff, g.kickoffTBD)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center py-2.5 pl-4 font-mono text-xs text-muted-foreground">
          {loading
            ? "Loading live schedule…"
            : error
              ? "Live schedule unavailable"
              : `Week ${week ?? ""} schedule loading…`}
        </div>
      )}
    </div>
  )
}
