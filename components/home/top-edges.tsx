'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Zap,
  LayoutGrid,
  CreditCard,
  LineChart,
  Trophy,
  Calendar,
  ArrowRight,
} from 'lucide-react'
import { useLiveBoard, formatKickoff, type LiveBoardGame } from '@/lib/use-live-board'
import { TeamLogo } from '@/components/team-logo'

const tabs = [
  { id: 'edges', label: 'Top Edges', icon: Zap },
  { id: 'all', label: 'All Games', icon: LayoutGrid },
  { id: 'card', label: 'My Card', icon: CreditCard },
  { id: 'trends', label: 'Trends', icon: LineChart },
  { id: 'ratings', label: 'BSE Ratings', icon: Trophy },
]

const PLACEHOLDER = '—'

export function TopEdges() {
  const [active, setActive] = useState('edges')
  const { games, week, projectionsAvailable, loading, error } = useLiveBoard()

  // When projections exist, rank by edge; until then show the week's marquee
  // matchups in kickoff order so the homepage reflects the real slate.
  const rows = [...games]
    .sort((a, b) => {
      if (projectionsAvailable) {
        return (b.edgeSpread ?? -Infinity) - (a.edgeSpread ?? -Infinity)
      }
      return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
    })
    .slice(0, 5)

  return (
    <section className="border-b border-border/60 bg-background py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {/* Tabs + week selector */}
          <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="scrollbar-none flex gap-2 overflow-x-auto">
              {tabs.map((t) => {
                const isActive = t.id === active
                return (
                  <button
                    key={t.id}
                    onClick={() => setActive(t.id)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3.5 py-2 font-display text-xs font-bold uppercase tracking-wider transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/40'
                        : 'text-muted-foreground hover:text-foreground'
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
              {week ? `Week ${week}` : 'Week —'}
            </span>
          </div>

          <div className="p-4 sm:p-6">
            <h2 className="mb-4 font-display text-lg font-bold uppercase tracking-wide text-foreground">
              {projectionsAvailable ? 'Top Edges This Week' : "This Week's Games"}
            </h2>

            {loading && (
              <p className="font-mono text-sm text-muted-foreground">Loading live games…</p>
            )}
            {error && !loading && (
              <p className="font-mono text-sm text-destructive">{`Unable to load games: ${error}`}</p>
            )}
            {!loading && !error && rows.length === 0 && (
              <p className="font-mono text-sm text-muted-foreground">
                No games scheduled for this week yet.
              </p>
            )}

            {/* Desktop table */}
            {rows.length > 0 && (
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      <th className="py-3 pr-4 font-medium">Matchup</th>
                      <th className="px-4 py-3 text-center font-medium">Kickoff</th>
                      <th className="px-4 py-3 text-center font-medium">Market Spread</th>
                      <th className="px-4 py-3 text-center font-medium">BSE Projection</th>
                      <th className="px-4 py-3 text-center font-medium text-primary">
                        Spread Edge
                      </th>
                      <th className="px-4 py-3 text-center font-medium">BSE Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((g) => (
                      <tr key={g.id} className="transition-colors hover:bg-secondary/40">
                        <td className="py-4 pr-4">
                          <Matchup game={g} />
                        </td>
                        <td className="px-4 py-4 text-center font-mono text-xs text-muted-foreground">
                          {formatKickoff(g.kickoff, g.kickoffTBD)}
                        </td>
                        <td className="px-4 py-4 text-center font-mono text-foreground">
                          {g.marketSpread == null ? PLACEHOLDER : fmtSpread(g.marketSpread)}
                        </td>
                        <td className="px-4 py-4 text-center font-mono text-foreground">
                          {g.fairSpread == null ? (
                            <span className="text-muted-foreground">{PLACEHOLDER}</span>
                          ) : (
                            fmtSpread(g.fairSpread)
                          )}
                        </td>
                        <td className="px-4 py-4 text-center font-mono font-bold text-primary">
                          {g.edgeSpread == null ? (
                            <span className="text-muted-foreground">{PLACEHOLDER}</span>
                          ) : (
                            `+${g.edgeSpread.toFixed(1)}`
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {g.bseRating == null ? (
                            <span className="font-mono text-muted-foreground">{PLACEHOLDER}</span>
                          ) : (
                            <span className="inline-flex h-8 w-10 items-center justify-center rounded border border-primary/50 font-display text-sm font-bold text-primary">
                              {g.bseRating}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile cards */}
            {rows.length > 0 && (
              <div className="space-y-3 md:hidden">
                {rows.map((g) => (
                  <div key={g.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                    <div className="flex items-center justify-between">
                      <Matchup game={g} />
                      {g.bseRating == null ? (
                        <span className="font-mono text-xs text-muted-foreground">{PLACEHOLDER}</span>
                      ) : (
                        <span className="inline-flex h-8 w-10 items-center justify-center rounded border border-primary/50 font-display text-sm font-bold text-primary">
                          {g.bseRating}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-xs">
                      <Cell
                        label="Market"
                        value={g.marketSpread == null ? PLACEHOLDER : fmtSpread(g.marketSpread)}
                      />
                      <Cell
                        label="BSE"
                        value={g.fairSpread == null ? PLACEHOLDER : fmtSpread(g.fairSpread)}
                      />
                      <Cell
                        label="Edge"
                        value={g.edgeSpread == null ? PLACEHOLDER : `+${g.edgeSpread.toFixed(1)}`}
                        accent={g.edgeSpread != null}
                      />
                    </div>
                    <div className="mt-3 font-mono text-xs text-muted-foreground">
                      {formatKickoff(g.kickoff, g.kickoffTBD)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 text-center">
              <Link
                href="/board"
                className="inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-primary hover:text-primary/80"
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

function fmtSpread(n: number): string {
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1)
}

function Matchup({ game }: { game: LiveBoardGame }) {
  return (
    <div className="flex items-center gap-2 font-display text-sm">
      <span className="flex items-center gap-1.5 font-semibold text-foreground">
        <TeamLogo name={game.away.name} abbr={game.away.abbr} size="sm" />
        {game.away.name}
      </span>
      <span className="text-muted-foreground">@</span>
      <span className="flex items-center gap-1.5 font-semibold text-foreground">
        <TeamLogo name={game.home.name} abbr={game.home.abbr} size="sm" />
        {game.home.name}
      </span>
    </div>
  )
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  )
}
