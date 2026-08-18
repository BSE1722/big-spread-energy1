import { games, formatSpread } from "@/lib/data"

export function LiveTicker() {
  const items = [...games, ...games]
  return (
    <div className="w-full overflow-hidden border-y border-border bg-card">
      <div className="flex w-max animate-[ticker_40s_linear_infinite] items-center gap-8 py-2.5">
        {items.map((g, i) => (
          <div key={`${g.id}-${i}`} className="flex items-center gap-2 whitespace-nowrap px-2 font-mono text-xs">
            <span className="text-muted-foreground">{g.away.abbr}</span>
            <span className="text-foreground">@</span>
            <span className="text-muted-foreground">{g.home.abbr}</span>
            <span className="text-foreground/70">{formatSpread(g.marketSpread)}</span>
            <span className="text-primary">FAIR {formatSpread(g.fairSpread)}</span>
            <span className="rounded bg-primary/15 px-1.5 text-primary">+{g.edgeSpread.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
