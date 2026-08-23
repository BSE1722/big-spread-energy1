"use client"

import { Clock, Scale, Layers, TriangleAlert } from "lucide-react"
import { CurrentWeekSlate } from "@/components/parlay/current-week-slate"

/**
 * Parlay Analyzer — grades a full ticket, not just its odds.
 *
 * The grade (BSE true probability, edge, EV, KEEP/REMOVE/REPLACE, correlation)
 * is derived from the BSE model's per-game output. That output isn't published
 * for the live board yet, so this surface does NOT fabricate probabilities or
 * verdicts. It explains what the analyzer measures and shows the real
 * current-week slate whose legs it will grade once the model runs.
 */

const MEASURES = [
  {
    icon: Scale,
    label: "Every leg, graded",
    description:
      "BSE true probability vs the book's implied price, plus a KEEP / REMOVE / REPLACE call per leg.",
  },
  {
    icon: Layers,
    label: "Whole-ticket EV",
    description:
      "Joint hit probability, fair odds, and expected value across the full ticket — not leg-by-leg guesswork.",
  },
  {
    icon: TriangleAlert,
    label: "Correlation checks",
    description:
      "Flags legs that share risk, so the real chance of hitting them all isn't overstated.",
  },
]

export function ParlayAnalyzer() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Honest pending state + the real slate whose legs will be graded */}
      <div className="space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-5">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock className="size-5" />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-foreground">
              Grading activates when this week&apos;s BSE projections publish
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              The analyzer grades each leg against the BSE model&apos;s true
              probabilities. Those aren&apos;t out for the current board yet, so we
              won&apos;t show fabricated edges, EV, or a verdict. Below is the real
              current-week slate whose bets it will grade the moment the model runs.
            </p>
          </div>
        </div>

        <CurrentWeekSlate />
      </div>

      {/* What the analyzer measures (informational — no fabricated verdict) */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
              What BSE grades
            </h2>
          </div>
          <div className="flex flex-col gap-4 p-4">
            {MEASURES.map((m) => (
              <div key={m.label} className="flex items-start gap-3">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <m.icon className="size-4" />
                </span>
                <div>
                  <p className="font-display text-sm font-semibold text-foreground">{m.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {m.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
