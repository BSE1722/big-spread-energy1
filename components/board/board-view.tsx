"use client"

import { useMemo, useState } from "react"
import { ArrowDownUp, TrendingUp, TrendingDown } from "lucide-react"
import { games, formatSpread, edgeGrade, type Game } from "@/lib/data"
import { EdgeBadge } from "@/components/edge-badge"
import { RatingMeter } from "@/components/rating-meter"
import { TeamLogo } from "@/components/team-logo"
import { TeamSearch } from "./team-search"
import { cn } from "@/lib/utils"

type Market = "spread" | "total"
type SortKey = "edge" | "rating" | "kickoff"

export function BoardView() {
  const [market, setMarket] = useState<Market>("spread")
  const [sort, setSort] = useState<SortKey>("edge")

  const rows = useMemo(() => {
    const list = [...games]
    if (sort === "edge") {
      list.sort((a, b) =>
        (market === "spread" ? b.edgeSpread - a.edgeSpread : b.edgeTotal - a.edgeTotal),
      )
    } else if (sort === "rating") {
      list.sort((a, b) => b.bseRating - a.bseRating)
    }
    return list
  }, [market, sort])

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
            <option value="edge">Edge</option>
            <option value="rating">BSE Rating</option>
            <option value="kickoff">Kickoff</option>
          </select>
        </label>
      </div>
      <div style={{ color: "red", fontSize: "24px", fontWeight: "bold" }}>
TEAM SEARCH TEST
</div>
<TeamSearch />
      {/* Desktop table */}
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

      {/* Mobile cards */}
      <div className="mt-4 flex flex-col gap-3 lg:hidden">
        {rows.map((g) => (
          <BoardCard key={g.id} g={g} market={market} />
        ))}
      </div>
    </div>
  )
}

function marketVals(g: Game, market: Market) {
  return market === "spread"
    ? { mkt: formatSpread(g.marketSpread), fair: formatSpread(g.fairSpread), edge: g.edgeSpread }
    : { mkt: g.marketTotal.toFixed(1), fair: g.fairTotal.toFixed(1), edge: g.edgeTotal }
}

function BoardRow({ g, market }: { g: Game; market: Market }) {
  const v = marketVals(g, market)
  return (
    <tr className="bg-background transition-colors hover:bg-card">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          {g.status === "live" && (
            <span className="h-2 w-2 rounded-full bg-primary [animation:live-pulse_1.6s_ease-in-out_infinite]" />
          )}
          <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-foreground">
            <TeamLogo name={g.away.name} abbr={g.away.abbr} size="sm" />
            {g.away.rank && <span className="text-muted-foreground">{g.away.rank} </span>}
            {g.away.abbr}
            <span className="mx-0.5 text-muted-foreground">@</span>
            <TeamLogo name={g.home.name} abbr={g.home.abbr} size="sm" />
            {g.home.rank && <span className="text-muted-foreground">{g.home.rank} </span>}
            {g.home.abbr}
          </span>
        </div>
      </td>
      <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
        {g.kickoff}
        <span className="ml-1 opacity-60">· {g.network}</span>
      </td>
      <td className="px-4 py-3.5 text-right font-mono text-sm text-foreground/80">{v.mkt}</td>
      <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold text-primary">{v.fair}</td>
      <td className="px-4 py-3.5 text-right">
        <EdgeBadge edge={v.edge} />
      </td>
      <td className="px-4 py-3.5">
        <RatingMeter value={g.bseRating} className="w-32" />
      </td>
      <td className="px-4 py-3.5">
        <span className="font-display text-sm font-semibold text-foreground">{g.pick}</span>
      </td>
    </tr>
  )
}

function BoardCard({ g, market }: { g: Game; market: Market }) {
  const v = marketVals(g, market)
  const grade = edgeGrade(v.edge)
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {g.status === "live" && (
              <span className="h-2 w-2 rounded-full bg-primary [animation:live-pulse_1.6s_ease-in-out_infinite]" />
            )}
            <span className="flex items-center gap-1.5 font-display text-base font-semibold text-foreground">
              <TeamLogo name={g.away.name} abbr={g.away.abbr} size="sm" />
              {g.away.abbr} <span className="text-muted-foreground">@</span>
              <TeamLogo name={g.home.name} abbr={g.home.abbr} size="sm" />
              {g.home.abbr}
            </span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
            {g.kickoff} · {g.network}
          </div>
        </div>
        <EdgeBadge edge={v.edge} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-background p-3 text-center">
        <div>
          <div className="font-mono text-[10px] uppercase text-muted-foreground">Market</div>
          <div className="mt-1 font-mono text-sm text-foreground/80">{v.mkt}</div>
        </div>
        <div className="border-x border-border">
              <div className="font-mono text-[10px] uppercase text-muted-foreground">BSE Projection</div>
          <div className="mt-1 font-mono text-sm font-semibold text-primary">{v.fair}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase text-muted-foreground">Rating</div>
          <div className="mt-1 font-mono text-sm text-foreground">{g.bseRating}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="font-display text-sm font-semibold text-foreground">{g.pick}</span>
        <span
          className={cn(
            "font-mono text-[11px] uppercase tracking-wide",
            grade.tone === "elite" || grade.tone === "strong" ? "text-primary" : "text-muted-foreground",
          )}
        >
          {grade.label}
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
