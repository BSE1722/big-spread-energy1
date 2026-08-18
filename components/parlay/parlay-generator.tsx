"use client"

import { useState } from "react"
import { Dice5, RefreshCw, Zap } from "lucide-react"
import { parlayGeneratorLegs, toDecimal, toAmerican, formatMoneyline, type ParlayLeg } from "@/lib/data"
import { cn } from "@/lib/utils"

type Risk = "chalk" | "balanced" | "longshot"

const riskConfig: Record<Risk, { label: string; desc: string; legs: number }> = {
  chalk: { label: "Chalk", desc: "Safer legs, higher hit rate", legs: 2 },
  balanced: { label: "Balanced", desc: "BSE's best mix of edge & odds", legs: 3 },
  longshot: { label: "Longshot", desc: "Max edge, big payout swings", legs: 4 },
}

function buildParlay(risk: Risk, seed: number): ParlayLeg[] {
  const count = riskConfig[risk].legs
  const pool = [...parlayGeneratorLegs]
  // Chalk favors highest BSE rating, longshot favors highest edge, balanced blends.
  pool.sort((a, b) => {
    if (risk === "chalk") return b.bseRating - a.bseRating
    if (risk === "longshot") return b.edge - a.edge
    return b.bseRating + b.edge * 4 - (a.bseRating + a.edge * 4)
  })
  // Rotate the pool by the seed so "regenerate" produces a fresh but sensible set.
  const rotated = [...pool.slice(seed % pool.length), ...pool.slice(0, seed % pool.length)]
  return rotated.slice(0, count)
}

export function ParlayGenerator() {
  const [risk, setRisk] = useState<Risk>("balanced")
  const [seed, setSeed] = useState(0)

  const legs = buildParlay(risk, seed)
  const marketDecimal = legs.reduce((acc, l) => acc * toDecimal(l.odds), 1)
  const avgRating = legs.reduce((acc, l) => acc + l.bseRating, 0) / legs.length
  const totalEdge = legs.reduce((acc, l) => acc + l.edge, 0)
  const american = toAmerican(marketDecimal)
  const payoutOn50 = 50 * marketDecimal

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Controls */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            <Dice5 className="size-4 text-primary" />
            Risk profile
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            {(Object.keys(riskConfig) as Risk[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRisk(r)}
                className={cn(
                  "rounded-lg border px-4 py-3 text-left transition-colors",
                  risk === r
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40",
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
                    {riskConfig[r].label}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {riskConfig[r].legs} legs
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {riskConfig[r].desc}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
          >
            <RefreshCw className="size-4" />
            Get Parlaid
          </button>
        </div>
      </div>

      {/* Generated ticket */}
      <div className="rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            <Zap className="size-4 text-primary" />
            Your generated ticket
          </h2>
          <span className="font-mono text-lg font-bold text-primary">
            {formatMoneyline(american)}
          </span>
        </div>

        <ul className="divide-y divide-border">
          {legs.map((leg, i) => (
            <li key={leg.id} className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-semibold text-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-sm font-semibold text-foreground">
                  {leg.pick}
                </span>
                <span className="block font-mono text-[11px] text-muted-foreground">
                  {leg.game}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-sm text-foreground">
                  {formatMoneyline(leg.odds)}
                </span>
                <span className="block font-mono text-[11px] text-primary">
                  +{leg.edge.toFixed(1)}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-3 divide-x divide-border border-t border-border bg-card">
          <Stat label="BSE Confidence" value={`${avgRating.toFixed(0)}`} suffix="/100" />
          <Stat label="Total edge" value={`+${totalEdge.toFixed(1)}`} />
          <Stat label="Wins on $50" value={`$${(payoutOn50 - 50).toFixed(0)}`} />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="px-4 py-4 text-center">
      <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold text-primary">
        {value}
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  )
}
