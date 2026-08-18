"use client"

import { useState } from "react"
import { Dice5, RefreshCw, Zap, Ban, ArrowRight } from "lucide-react"
import { OBJECTIVES, OBJECTIVE_ORDER } from "@/lib/bse/generator"
import { useGeneratedParlay } from "@/lib/bse/hooks"
import { formatAmerican, formatPercent } from "@/lib/bse/odds"
import type { ParlayObjective } from "@/lib/bse/types"
import { cn } from "@/lib/utils"

export function ParlayGenerator() {
  const [objective, setObjective] = useState<ParlayObjective>("SWEET_SPOT")
  const [stake, setStake] = useState(50)
  const [nonce, setNonce] = useState(0)

  const result = useGeneratedParlay(objective, stake, nonce)
  const ticket = result.ticket
  const a = ticket?.analysis

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Controls */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            <Dice5 className="size-4 text-primary" />
            BSE objective
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            {OBJECTIVE_ORDER.map((id) => {
              const cfg = OBJECTIVES[id]
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setObjective(id)}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left transition-colors",
                    objective === id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
                      {cfg.label}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {cfg.minLegs}-{cfg.maxLegs} legs
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {cfg.description}
                  </span>
                </button>
              )
            })}
          </div>

          <label className="mt-4 block">
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              Stake ($)
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={stake}
              onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 0))}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none focus:border-primary"
            />
          </label>

          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
          >
            <RefreshCw className="size-4" />
            Get Parlaid
          </button>

          <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
            BSE evaluates combinations and only recommends a ticket that clears
            its probability, value, confidence, and correlation thresholds. It
            will decline rather than force a bet.
          </p>
        </div>
      </div>

      {/* Generated ticket OR honest no-recommendation */}
      <div className="rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            <Zap className="size-4 text-primary" />
            {OBJECTIVES[objective].label} ticket
          </h2>
          {a && (
            <span className="font-mono text-lg font-bold text-primary">
              {formatAmerican(a.offeredAmerican)}
            </span>
          )}
        </div>

        {!ticket || !a ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <Ban className="size-8 text-muted-foreground" />
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{result.message}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              Evaluated {result.evaluatedCombinations} combinations
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {a.legs.map((leg, i) => (
                <li key={leg.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-semibold text-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-sm font-semibold text-foreground">
                      {leg.label}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {leg.gameLabel} · {formatPercent(leg.trueProbability)} true
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-sm text-foreground">
                      {formatAmerican(leg.americanOdds)}
                    </span>
                    <span className="block font-mono text-[11px] text-primary">{leg.rating.score} BSE</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-2 divide-x divide-border border-t border-border bg-card sm:grid-cols-4">
              <Stat label="Confidence" value={`${a.confidence}`} suffix="/100" />
              <Stat label="Joint hit" value={formatPercent(a.jointProbability)} />
              <Stat
                label="Expected value"
                value={`${a.evPerUnit >= 0 ? "+" : ""}${(a.evPerUnit * 100).toFixed(1)}%`}
                tone={a.evPerUnit >= 0 ? "good" : "bad"}
              />
              <Stat label={`Wins on $${a.stake}`} value={`$${a.profit.toFixed(0)}`} />
            </div>

            {/* Why BSE built this */}
            <div className="border-t border-border px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                Why BSE built this ticket
              </p>
              <p className="mt-1 text-xs leading-relaxed text-foreground">{ticket.rationale}</p>
            </div>

            {/* Weakest leg + removal simulation */}
            {a.ifWeakestRemoved && a.weakestLegId && (
              <div className="flex items-start gap-2 border-t border-border bg-secondary/40 px-4 py-3">
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Weakest leg:{" "}
                  <span className="font-semibold text-foreground">
                    {a.legs.find((l) => l.id === a.weakestLegId)?.label}
                  </span>
                  . Dropping it moves EV to{" "}
                  <span className={cn(a.ifWeakestRemoved.evPerUnit >= 0 ? "text-primary" : "text-destructive")}>
                    {(a.ifWeakestRemoved.evPerUnit * 100).toFixed(1)}%
                  </span>{" "}
                  and joint hit to {formatPercent(a.ifWeakestRemoved.jointProbability)} — BSE kept it because the
                  full ticket scored higher for this objective.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string
  value: string
  suffix?: string
  tone?: "good" | "bad"
}) {
  return (
    <div className="px-4 py-4 text-center">
      <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-display text-2xl font-bold",
          tone === "bad" ? "text-destructive" : "text-primary",
        )}
      >
        {value}
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  )
}
