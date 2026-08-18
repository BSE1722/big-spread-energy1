"use client"

import { useMemo, useState } from "react"
import { Check, Trophy, AlertTriangle, ArrowRight, Skull, TriangleAlert } from "lucide-react"
import { getParlayPool, type PoolLeg } from "@/lib/bse/pool"
import { useParlayAnalysis } from "@/lib/bse/hooks"
import { formatAmerican, formatPercent } from "@/lib/bse/odds"
import type { LegAnalysis, LegRecommendation } from "@/lib/bse/types"
import { cn } from "@/lib/utils"

const REC_STYLES: Record<LegRecommendation, string> = {
  KEEP: "bg-primary/15 text-primary",
  REPLACE: "bg-primary/10 text-primary",
  REMOVE: "bg-destructive/15 text-destructive",
  AVOID: "bg-destructive/20 text-destructive",
}

export function ParlayAnalyzer() {
  const pool = useMemo<PoolLeg[]>(() => getParlayPool(), [])
  const [selected, setSelected] = useState<string[]>(() => pool.slice(0, 3).map((l) => l.id))
  const [stake, setStake] = useState(50)

  const legRefs = useMemo(
    () => pool.filter((l) => selected.includes(l.id)).map((l) => l.ref),
    [pool, selected],
  )

  const analysis = useParlayAnalysis(legRefs, stake)
  const hasTicket = analysis.legs.length >= 2

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const verdictTone = analysis.verdict.tone

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      {/* Leg selection + per-leg analysis */}
      <div className="space-y-6">
        <div className="rounded-xl border border-border">
          <div className="border-b border-border bg-card px-4 py-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
              Build or paste your parlay
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              Select 2+ legs — BSE grades the whole ticket, not just the odds
            </p>
          </div>
          <ul className="max-h-[320px] divide-y divide-border overflow-y-auto scrollbar-none">
            {pool.map((leg) => {
              const active = selected.includes(leg.id)
              return (
                <li key={leg.id}>
                  <button
                    type="button"
                    onClick={() => toggle(leg.id)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-card"
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {active && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-sm font-semibold text-foreground">
                        {leg.label}
                      </span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {leg.gameLabel}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-sm text-foreground">
                        {leg.oddsLabel}
                      </span>
                      <span className="block font-mono text-[11px] text-primary">
                        {leg.ratingScore} BSE
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Per-leg breakdown */}
        {hasTicket && (
          <div className="rounded-xl border border-border">
            <div className="border-b border-border bg-card px-4 py-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
                Leg-by-leg breakdown
              </h2>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                BSE true probability vs the book&apos;s price
              </p>
            </div>
            <ul className="divide-y divide-border">
              {analysis.legs.map((leg) => (
                <LegCard
                  key={leg.id}
                  leg={leg}
                  isKill={leg.id === analysis.killLegId}
                  isWeakest={leg.id === analysis.weakestLegId}
                  onReplace={(altId, removeId) => {
                    setSelected((prev) => {
                      const next = prev.filter((x) => x !== removeId)
                      if (!next.includes(altId)) next.push(altId)
                      return next
                    })
                  }}
                />
              ))}
            </ul>

            {analysis.correlationWarning && (
              <div className="flex items-start gap-2 border-t border-border bg-destructive/10 px-4 py-3 text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p className="text-xs leading-relaxed">
                  Correlated legs detected. These bets share risk, so the true
                  chance of hitting all of them is lower than a standard parlay
                  calculation implies.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Whole-ticket verdict */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
              BSE Verdict
            </h2>
            <span className="font-mono text-[11px] uppercase text-muted-foreground">
              {analysis.legs.length} legs
            </span>
          </div>

          <div className="p-4">
            <label className="mb-4 block">
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

            {!hasTicket ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                <AlertTriangle className="size-5 shrink-0 text-muted-foreground" />
                Select at least 2 legs to see the full BSE analysis.
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    "rounded-lg px-4 py-3",
                    verdictTone === "good" && "bg-primary text-primary-foreground",
                    verdictTone === "ok" && "bg-primary/15 text-primary",
                    verdictTone === "bad" && "bg-destructive/15 text-destructive",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
                      <Trophy className="size-5" />
                      {analysis.verdict.label}
                    </span>
                    <span className="font-mono text-sm font-semibold">
                      {analysis.evPerUnit >= 0 ? "+" : ""}
                      {(analysis.evPerUnit * 100).toFixed(1)}% EV
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed opacity-90">
                    {analysis.verdict.summary}
                  </p>
                </div>

                <dl className="mt-4 divide-y divide-border">
                  <Row label="Est. joint hit prob" value={formatPercent(analysis.jointProbability)} accent />
                  <Row
                    label="If independent"
                    value={formatPercent(analysis.independentJointProbability)}
                    muted
                  />
                  <Row label="Book implied prob" value={formatPercent(analysis.sportsbookImpliedProbability)} />
                  <Row label="Offered odds" value={formatAmerican(analysis.offeredAmerican)} />
                  <Row label="BSE fair odds" value={formatAmerican(analysis.fairAmerican)} accent />
                  <Row label="Confidence" value={`${analysis.confidence}/100`} />
                  <Row label="To win" value={`$${analysis.profit.toFixed(2)}`} />
                  <Row label="Payout" value={`$${analysis.payout.toFixed(2)}`} />
                  <Row
                    label="Expected value"
                    value={`${analysis.evDollars >= 0 ? "+" : ""}$${analysis.evDollars.toFixed(2)}`}
                    accent={analysis.evDollars >= 0}
                    danger={analysis.evDollars < 0}
                  />
                </dl>

                {/* Weakest-leg removal simulation */}
                {analysis.ifWeakestRemoved && analysis.weakestLegId && (
                  <div className="mt-4 rounded-lg border border-border p-3">
                    <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      <Skull className="size-3.5" />
                      Drop the weakest leg
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-foreground">
                      Removing{" "}
                      <span className="font-semibold">
                        {analysis.legs.find((l) => l.id === analysis.weakestLegId)?.label}
                      </span>{" "}
                      shifts EV to{" "}
                      <span className={cn(analysis.ifWeakestRemoved.evPerUnit >= 0 ? "text-primary" : "text-destructive")}>
                        {(analysis.ifWeakestRemoved.evPerUnit * 100).toFixed(1)}%
                      </span>
                      , joint hit to {formatPercent(analysis.ifWeakestRemoved.jointProbability)}, payout to $
                      {analysis.ifWeakestRemoved.payout.toFixed(2)}.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((prev) => prev.filter((x) => x !== analysis.weakestLegId))
                      }
                      className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-primary hover:underline"
                    >
                      Apply <ArrowRight className="size-3" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function LegCard({
  leg,
  isKill,
  isWeakest,
  onReplace,
}: {
  leg: LegAnalysis
  isKill: boolean
  isWeakest: boolean
  onReplace: (altId: string, removeId: string) => void
}) {
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold text-foreground">{leg.label}</span>
            <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase", REC_STYLES[leg.recommendation])}>
              {leg.recommendation}
            </span>
            {isKill && (
              <span className="rounded bg-destructive/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-destructive">
                Kill leg
              </span>
            )}
            {isWeakest && !isKill && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-muted-foreground">
                Weakest
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{leg.gameLabel}</p>
        </div>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-sm text-foreground">{formatAmerican(leg.americanOdds)}</span>
          <span className="block font-mono text-[11px] text-primary">{leg.rating.score} BSE</span>
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat label="Book implied" value={formatPercent(leg.impliedProbability)} />
        <Stat label="BSE true" value={formatPercent(leg.trueProbability)} accent />
        <Stat
          label="EV / unit"
          value={`${leg.evPerUnit >= 0 ? "+" : ""}${(leg.evPerUnit * 100).toFixed(1)}%`}
          accent={leg.evPerUnit >= 0}
          danger={leg.evPerUnit < 0}
        />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{leg.reason}</p>

      {leg.alternative && (
        <button
          type="button"
          onClick={() => onReplace(refId(leg.alternative!.ref), leg.id)}
          className="mt-2 flex w-full items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-left transition-colors hover:bg-primary/10"
        >
          <span className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              Stronger alternative
            </span>
            <span className="block truncate font-display text-sm font-semibold text-foreground">
              {leg.alternative.label}{" "}
              <span className="font-mono text-[11px] font-normal text-muted-foreground">
                · {leg.alternative.gameLabel}
              </span>
            </span>
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1 font-mono text-[11px] font-semibold text-primary">
            {leg.alternative.ratingScore} BSE <ArrowRight className="size-3" />
          </span>
        </button>
      )}
    </li>
  )
}

function refId(ref: { gameId: string; marketType: string; side: string }): string {
  return `${ref.gameId}-${ref.marketType}-${ref.side}`
}

function Stat({
  label,
  value,
  accent,
  danger,
}: {
  label: string
  value: string
  accent?: boolean
  danger?: boolean
}) {
  return (
    <div className="rounded-lg bg-background px-2 py-1.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-display text-sm font-semibold",
          accent ? "text-primary" : danger ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Row({
  label,
  value,
  accent,
  danger,
  muted,
}: {
  label: string
  value: string
  accent?: boolean
  danger?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-display text-base font-semibold",
          accent ? "text-primary" : danger ? "text-destructive" : muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  )
}
