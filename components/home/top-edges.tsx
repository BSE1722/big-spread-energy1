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
  ChevronDown,
  ArrowRight,
} from 'lucide-react'
import { games, formatSpread } from '@/lib/data'

const tabs = [
  { id: 'edges', label: 'Top Edges', icon: Zap },
  { id: 'all', label: 'All Games', icon: LayoutGrid },
  { id: 'card', label: 'My Card', icon: CreditCard },
  { id: 'trends', label: 'Trends', icon: LineChart },
  { id: 'ratings', label: 'BSE Ratings', icon: Trophy },
]

// win probability implied from the model, derived from edge + rating
function winProb(edge: number, rating: number): number {
  const p = 50 + edge * 3.5 + (rating - 75) * 0.4
  return Math.min(78, Math.max(52, Math.round(p)))
}

function betSignal(rating: number): { label: string; strong: boolean } | null {
  if (rating >= 90) return { label: 'Strong Play', strong: true }
  if (rating >= 70) return { label: 'Play', strong: false }
  return null
}

export function TopEdges() {
  const [active, setActive] = useState('edges')
  const rows = [...games].sort((a, b) => b.edgeSpread - a.edgeSpread).slice(0, 5)

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
            <button className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-3.5 py-2 font-display text-xs font-bold uppercase tracking-wider text-foreground">
              <Calendar className="h-4 w-4 text-primary" />
              Week 12
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="p-4 sm:p-6">
            <h2 className="mb-4 font-display text-lg font-bold uppercase tracking-wide text-foreground">
              Top Edges This Week
            </h2>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">Matchup</th>
                    <th className="px-4 py-3 text-center font-medium">Market Spread</th>
                    <th className="px-4 py-3 text-center font-medium">BSE Projection</th>
                    <th className="px-4 py-3 text-center font-medium text-primary">
                      Spread Edge ▾
                    </th>
                    <th className="px-4 py-3 text-center font-medium">BSE Rating</th>
                    <th className="px-4 py-3 text-center font-medium">Win Prob.</th>
                    <th className="px-4 py-3 text-center font-medium">Bet Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((g) => {
                    const signal = betSignal(g.bseRating)
                    return (
                      <tr key={g.id} className="transition-colors hover:bg-secondary/40">
                        <td className="py-4 pr-4">
                          <Matchup game={g} />
                        </td>
                        <td className="px-4 py-4 text-center font-mono text-foreground">
                          {formatSpread(g.marketSpread)}
                        </td>
                        <td className="px-4 py-4 text-center font-mono text-foreground">
                          {formatSpread(g.fairSpread)}
                        </td>
                        <td className="px-4 py-4 text-center font-mono font-bold text-primary">
                          +{g.edgeSpread.toFixed(1)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="inline-flex h-8 w-10 items-center justify-center rounded border border-primary/50 font-display text-sm font-bold text-primary">
                            {g.bseRating}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center font-mono text-foreground">
                          {winProb(g.edgeSpread, g.bseRating)}%
                        </td>
                        <td className="px-4 py-4 text-center">
                          {signal && <SignalBadge {...signal} />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {rows.map((g) => {
                const signal = betSignal(g.bseRating)
                return (
                  <div key={g.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                    <div className="flex items-center justify-between">
                      <Matchup game={g} />
                      <span className="inline-flex h-8 w-10 items-center justify-center rounded border border-primary/50 font-display text-sm font-bold text-primary">
                        {g.bseRating}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-xs">
                      <Cell label="Market" value={formatSpread(g.marketSpread)} />
                      <Cell label="BSE" value={formatSpread(g.fairSpread)} />
                      <Cell label="Edge" value={`+${g.edgeSpread.toFixed(1)}`} accent />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">
                        Win {winProb(g.edgeSpread, g.bseRating)}%
                      </span>
                      {signal && <SignalBadge {...signal} />}
                    </div>
                  </div>
                )
              })}
            </div>

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

function Matchup({ game }: { game: (typeof games)[number] }) {
  return (
    <div className="flex items-center gap-2 font-display text-sm">
      <span className="font-semibold text-foreground">
        {game.away.rank && <span className="text-muted-foreground">{game.away.rank} </span>}
        {game.away.name}
      </span>
      <span className="text-muted-foreground">@</span>
      <span className="font-semibold text-foreground">
        {game.home.rank && <span className="text-muted-foreground">{game.home.rank} </span>}
        {game.home.name}
      </span>
    </div>
  )
}

function SignalBadge({ label, strong }: { label: string; strong: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider ${
        strong
          ? 'bg-primary text-primary-foreground'
          : 'border border-primary/50 text-primary'
      }`}
    >
      {label}
    </span>
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
