"use client"

import { useMemo, useState } from "react"
import { ArrowDownUp, TrendingUp, TrendingDown } from "lucide-react"
import { useLiveBoard, formatKickoff, formatKickoffDate, type LiveBoardGame } from "@/lib/use-live-board"
import { TeamName } from "@/components/team-name"
import { cn } from "@/lib/utils"

type Market = "spread" | "total"
type SortKey = "edge" | "rating" | "kickoff"

/** Placeholder shown wherever a live BSE model number does not exist yet. */
const PLACEHOLDER = "—"

export function BoardView() {
  const [market, setMarket] = useState<Market>("spread")
  const [sort, setSort] = useState<SortKey>("kickoff")
  const { games, week, projectionsAvailable, loading, error } = useLiveBoard()

  const rows = useMemo(() => {
    const list = [...games]
    if (sort === "edge") {
      list.sort((a, b) => {
        const ea = (market === "spread" ? a.edgeSpread : a.edgeTotal) ?? -Infinity
        const eb = (market === "spread" ? b.edgeSpread : b.edgeTotal) ?? -Infinity
        return eb - ea
      })
    } else if (sort === "rating") {
      list.sort((a, b) => (b.bseRating ?? -Infinity) - (a.bseRating ?? -Infinity))
    } else {
      list.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    }
    return list
  }, [games, market, sort])

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {(["spread", "total"] as Market[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMarket(m)}
              className={cn(
                "min-h-9 rounded-md px-4 font-display text-sm font-semibold uppercase tracking-wide transition-colors",
                market === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <ArrowDownUp className="size-4 text-muted-foreground" />
          <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
            Sort
          </span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-transparent font-display text-sm font-semibold uppercase tracking-wide text-foreground outline-none"
          >
            <option value="kickoff">Kickoff</option>
            <option value="edge">Edge</option>
            <option value="rating">BSE Rating</option>
          </select>
        </label>
      </div>

      {/* Projection placeholder notice — only while no live model output exists */}
      {!projectionsAvailable && !loading && !error && rows.length > 0 && (
        <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {`Week ${week ?? ""} live schedule · BSE projections publish before kickoff`}
        </p>
      )}

      {/* States */}
      {loading && (
        <p className="mt-6 font-mono text-sm text-muted-foreground">Loading live games…</p>
      )}
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

      {/* Desktop table */}
      {rows.length > 0 && (
        <div className="mt-4 hidden overflow-hidden rounded-xl border border-border lg:block">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-card font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Matchup</th>
                <th className="px-4 py-3 font-medium">Kickoff</th>
                <th className="px-4 py-3 text-right font-medium">Market</th>
                <th className="px-4 py-3 text-right font-medium">BSE Projection</th>
                <th className="px-4 py-3 text-right font-medium">Edge</th>
                <th className="px-4 py-3 font-medium">BSE Rating</th>
                <th className="px-4 py-3 font-medium">BSE Pick</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((g) => (
                <BoardRow key={g.id} g={g} market={market} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {rows.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 lg:hidden">
          {rows.map((g) => (
            <BoardCard key={g.id} g={g} market={market} />
          ))}
        </div>
      )}
    </div>
  )
}

function fmtSpread(n: number | null): string {
  if (n == null) return PLACEHOLDER
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1)
}

/**
 * The market spread is stored home-relative. The favorite is the team giving
 * points (the side with the negative number): home when marketSpread < 0,
 * away when > 0. Returns the favored team's abbreviation paired with its own
 * (negative) spread, e.g. "TCU -7.5". Falls back to a plain PK / placeholder.
 */
function favoredSpread(g: LiveBoardGame): string {
  const s = g.marketSpread
  if (s == null) return PLACEHOLDER
  if (s === 0) return "PK"
  const favAbbr = s < 0 ? g.home.abbr : g.away.abbr
  const favLine = s < 0 ? s : -s
  return `${favAbbr} ${favLine.toFixed(1)}`
}

function marketVals(g: LiveBoardGame, market: Market) {
  return market === "spread"
    ? { mkt: favoredSpread(g), fair: fmtSpread(g.fairSpread), edge: g.edgeSpread }
    : {
        mkt: g.marketTotal == null ? PLACEHOLDER : g.marketTotal.toFixed(1),
        fair: g.fairTotal == null ? PLACEHOLDER : g.fairTotal.toFixed(1),
        edge: g.edgeTotal,
      }
}

function EdgeCell({ edge }: { edge: number | null }) {
  if (edge == null) {
    return <span className="font-mono text-sm text-muted-foreground">{PLACEHOLDER}</span>
  }
  return (
    <span className="font-mono text-sm font-semibold text-primary">
      {edge > 0 ? `+${edge.toFixed(1)}` : edge.toFixed(1)}
    </span>
  )
}

function RatingCell({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="font-mono text-sm text-muted-foreground">{PLACEHOLDER}</span>
  }
  return (
    <span className="inline-flex h-8 w-10 items-center justify-center rounded border border-primary/50 font-display text-sm font-bold text-primary">
      {value}
    </span>
  )
}

function BoardRow({ g, market }: { g: LiveBoardGame; market: Market }) {
  const v = marketVals(g, market)
  return (
    <tr className="bg-background transition-colors hover:bg-card">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2 font-display text-sm">
          <TeamName name={g.away.name} abbr={g.away.abbr} size="sm" />
          <span className="mx-0.5 text-muted-foreground">@</span>
          <TeamName name={g.home.name} abbr={g.home.abbr} size="sm" />
        </div>
      </td>
      <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
        <span className="text-foreground/80">{formatKickoffDate(g.kickoff)}</span>{" "}
        {formatKickoff(g.kickoff, g.kickoffTBD)}
        {g.neutralSite && <span className="ml-1 opacity-60">· N</span>}
      </td>
      <td className="px-4 py-3.5 text-right font-mono text-sm text-foreground/80">{v.mkt}</td>
      <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold text-primary">
        {v.fair === PLACEHOLDER ? (
          <span className="text-muted-foreground">{PLACEHOLDER}</span>
        ) : (
          v.fair
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        <EdgeCell edge={v.edge} />
      </td>
      <td className="px-4 py-3.5">
        <RatingCell value={g.bseRating} />
      </td>
      <td className="px-4 py-3.5">
        <span className="font-display text-sm font-semibold text-foreground">
          {g.pick ?? <span className="text-muted-foreground">{PLACEHOLDER}</span>}
        </span>
      </td>
    </tr>
  )
}

function BoardCard({ g, market }: { g: LiveBoardGame; market: Market }) {
  const v = marketVals(g, market)
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-display text-base">
            <TeamName name={g.away.name} abbr={g.away.abbr} label="abbr" size="sm" />
            <span className="text-muted-foreground">@</span>
            <TeamName name={g.home.name} abbr={g.home.abbr} label="abbr" size="sm" />
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
            <span className="text-foreground/80">{formatKickoffDate(g.kickoff)}</span>{" · "}
            {formatKickoff(g.kickoff, g.kickoffTBD)}
            {g.neutralSite && " · Neutral"}
          </div>
        </div>
        <EdgeCell edge={v.edge} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-background p-3 text-center">
        <div>
          <div className="font-mono text-[10px] uppercase text-muted-foreground">Market</div>
          <div className="mt-1 font-mono text-sm text-foreground/80">{v.mkt}</div>
        </div>
        <div className="border-x border-border">
          <div className="font-mono text-[10px] uppercase text-muted-foreground">BSE Projection</div>
          <div className="mt-1 font-mono text-sm font-semibold text-primary">
            {v.fair === PLACEHOLDER ? (
              <span className="text-muted-foreground">{PLACEHOLDER}</span>
            ) : (
              v.fair
            )}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase text-muted-foreground">Rating</div>
          <div className="mt-1 font-mono text-sm text-foreground">
            {g.bseRating ?? <span className="text-muted-foreground">{PLACEHOLDER}</span>}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="font-display text-sm font-semibold text-foreground">
          {g.pick ?? <span className="text-muted-foreground">{PLACEHOLDER}</span>}
        </span>
      </div>
    </div>
  )
}

export function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <TrendingUp className="size-4 text-primary" />
  if (trend === "down") return <TrendingDown className="size-4 text-destructive" />
  return <span className="text-muted-foreground">—</span>
}
