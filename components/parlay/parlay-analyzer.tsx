"use client"

import { useMemo, useState } from "react"
import { Check, Trophy, AlertTriangle } from "lucide-react"
import { parlayGeneratorLegs, toDecimal, toAmerican, formatMoneyline, type ParlayLeg } from "@/lib/data"
import { cn } from "@/lib/utils"

// Each point of edge adds ~2% of true win probability over the market implied.
function fairProbForLeg(leg: ParlayLeg) {
  const implied = 1 / toDecimal(leg.odds)
  return Math.min(0.97, implied + leg.edge * 0.02)
}

export function ParlayAnalyzer() {
  const [selected, setSelected] = useState<string[]>(["g1", "g2"])
  const [stake, setStake] = useState(50)

  const legs = parlayGeneratorLegs.filter((l) => selected.includes(l.id))

  const analysis = useMemo(() => {
    if (legs.length < 2) return null
    const marketDecimal = legs.reduce((acc, l) => acc * toDecimal(l.odds), 1)
    const fairProb = legs.reduce((acc, l) => acc * fairProbForLeg(l), 1)
    const fairDecimal = 1 / fairProb
    const payout = stake * marketDecimal
    const profit = payout - stake
    // Expected value using BSE fair probability
    const ev = fairProb * (marketDecimal - 1) - (1 - fairProb)
    const evDollars = ev * stake
    const edgePct = (marketDecimal / fairDecimal - 1) * 100
    return {
      marketAmerican: toAmerican(marketDecimal),
      fairAmerican: toAmerican(fairDecimal),
      fairProb,
      payout,
      profit,
      ev,
      evDollars,
      edgePct,
    }
  }, [legs, stake])

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const verdict = analysis
    ? analysis.ev > 0.08
      ? { label: "SMASH", tone: "good" as const }
      : analysis.ev > 0
        ? { label: "PLAYABLE", tone: "ok" as const }
        : { label: "FADE", tone: "bad" as const }
    : null

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Leg selection */}
      <div className="rounded-xl border border-border">
        <div className="border-b border-border bg-card px-4 py-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            Build your parlay
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            Select 2+ legs to grade
          </p>
        </div>
        <ul className="divide-y divide-border">
          {parlayGeneratorLegs.map((leg) => {
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
                      +{leg.edge.toFixed(1)} edge
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Ticket / analysis */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
              BSE Grade
            </h2>
            <span className="font-mono text-[11px] uppercase text-muted-foreground">
              {legs.length} legs
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

            {!analysis ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                <AlertTriangle className="size-5 shrink-0 text-muted-foreground" />
                Select at least 2 legs to see your BSE grade.
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    "flex items-center justify-between rounded-lg px-4 py-3",
                    verdict?.tone === "good" && "bg-primary text-primary-foreground",
                    verdict?.tone === "ok" && "bg-primary/15 text-primary",
                    verdict?.tone === "bad" && "bg-destructive/15 text-destructive",
                  )}
                >
                  <span className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
                    <Trophy className="size-5" />
                    {verdict?.label}
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {analysis.edgePct >= 0 ? "+" : ""}
                    {analysis.edgePct.toFixed(1)}% edge
                  </span>
                </div>

                <dl className="mt-4 divide-y divide-border">
                  <Row label="Parlay odds" value={formatMoneyline(analysis.marketAmerican)} />
                  <Row label="BSE fair odds" value={formatMoneyline(analysis.fairAmerican)} accent />
                  <Row label="Win probability" value={`${(analysis.fairProb * 100).toFixed(1)}%`} />
                  <Row label="To win" value={`$${analysis.profit.toFixed(2)}`} />
                  <Row label="Payout" value={`$${analysis.payout.toFixed(2)}`} />
                  <Row
                    label="Expected value"
                    value={`${analysis.evDollars >= 0 ? "+" : ""}$${analysis.evDollars.toFixed(2)}`}
                    accent={analysis.evDollars >= 0}
                    danger={analysis.evDollars < 0}
                  />
                </dl>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({
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
    <div className="flex items-center justify-between py-2.5">
      <dt className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "font-display text-base font-semibold",
          accent ? "text-primary" : danger ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  )
}
