"use client"

import { useState, useTransition } from "react"
import { FlaskConical, ArrowRight } from "lucide-react"
import { checkAlternate, type AltCheckResult } from "@/app/actions/alt-lab"

type Side = "home" | "away"

/**
 * Interactive Alternate Spread Lab. The customer enters a team + spread + price;
 * the SERVER recomputes value against the FINAL BSE fair line (never trusting
 * the entered number for the fair spread) and returns line edge, protection vs
 * the main line, implied breakeven change, cost per point, and whether it
 * clears BSE's gate. Value thresholds and the current market read are rendered
 * by the parent server component; this is only the "check an alternate" tool.
 */
export function AltSpreadLab({
  gameId,
  homeTeam,
  awayTeam,
  homeAbbr,
  awayAbbr,
}: {
  gameId: string
  homeTeam: string
  awayTeam: string
  homeAbbr: string
  awayAbbr: string
}) {
  const [side, setSide] = useState<Side>("home")
  const [spread, setSpread] = useState("")
  const [price, setPrice] = useState("")
  const [result, setResult] = useState<AltCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const s = Number.parseFloat(spread)
    const p = Number.parseFloat(price)
    if (!Number.isFinite(s) || !Number.isFinite(p)) {
      setError("Enter a spread (e.g. -7.5) and an American price (e.g. -110).")
      return
    }
    startTransition(async () => {
      const res = await checkAlternate({ gameId, side, spread: s, price: p })
      if (!res.ok) {
        setError(res.error ?? "Could not evaluate that alternate.")
        setResult(null)
        return
      }
      setResult(res)
    })
  }

  const tone = result?.meetsThreshold ? "text-primary" : "text-foreground"

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-primary" />
        <h4 className="font-mono text-xs font-bold uppercase tracking-widest text-foreground">Check an Alternate</h4>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        Enter any DK alternate line and price. BSE recomputes edge versus the final fair number, protection gained off
        the main line, and whether it clears the gate.
      </p>

      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="flex overflow-hidden rounded-md border border-border">
          {(["home", "away"] as Side[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`px-3 py-2 font-mono text-xs uppercase tracking-wide transition-colors ${
                side === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={side === s}
            >
              {s === "home" ? homeAbbr : awayAbbr}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Spread</span>
          <input
            value={spread}
            onChange={(e) => setSpread(e.target.value)}
            inputMode="decimal"
            placeholder="-7.5"
            className="w-24 rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Price</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="numeric"
            placeholder="-110"
            className="w-24 rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Check"}
          <ArrowRight className="size-3.5" />
        </button>
      </form>

      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}

      {result ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">BSE Read</span>
            <span className={`font-display text-lg font-bold ${tone}`}>{result.classificationLabel}</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{result.classificationBlurb}</p>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-sm">
            <Stat k="Line edge" v={result.lineEdge != null ? `${result.lineEdge > 0 ? "+" : ""}${result.lineEdge.toFixed(1)} pt` : "—"} />
            <Stat k="Clears gate" v={result.meetsThreshold ? "Yes" : "No"} highlight={result.meetsThreshold} />
            <Stat k="Implied breakeven" v={result.impliedBreakevenPct != null ? `${result.impliedBreakevenPct.toFixed(1)}%` : "—"} />
            <Stat k="Price tier" v={result.priceTier} />
            {result.protectionPoints != null ? (
              <Stat
                k="Protection vs main"
                v={`${result.protectionPoints > 0 ? "+" : ""}${result.protectionPoints} pt`}
              />
            ) : null}
            {result.costPerPoint != null ? <Stat k="Cost / point" v={`${result.costPerPoint} pt`} /> : null}
          </dl>

          {result.protectionVerdict ? (
            <p
              className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${
                result.protectionWorthwhile
                  ? "border-primary/30 bg-primary/5 text-foreground/80"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {result.protectionVerdict}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Stat({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={highlight ? "font-semibold text-primary" : "text-foreground/80"}>{v}</dd>
    </div>
  )
}
