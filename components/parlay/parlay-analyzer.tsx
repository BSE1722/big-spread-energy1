"use client"

import { Scale, Coins, Layers } from "lucide-react"
import { InteractiveAnalyzer } from "@/components/parlay/interactive-analyzer"

/**
 * Parlay Analyzer — grades every spread leg on a ticket, PRICE-AWARE.
 *
 * Each leg is graded two ways from real data: the frozen model's fair spread
 * (line value, in points) and the DraftKings American price (bet cost). A leg
 * is never called good on point edge alone — an expensive price is surfaced.
 * No win probability or EV is shown (no validated point-to-cover calibration
 * exists), and alternate lines are graded from the real number the user enters,
 * never a fabricated ladder. See lib/bse/price-aware.
 */

const MEASURES = [
  {
    icon: Scale,
    label: "Line value, in points",
    description:
      "Each spread vs the BSE fair line — how many points better (or worse) than fair the number you're taking is.",
  },
  {
    icon: Coins,
    label: "Price, not just points",
    description:
      "The DraftKings American price becomes a breakeven %, so a good number at a punitive price is flagged, not rubber-stamped.",
  },
  {
    icon: Layers,
    label: "Honest ticket read",
    description:
      "Totals line value and counts strong vs expensive vs no-edge legs. No parlay win % or EV — none is calibrated, so none is claimed.",
  },
]

export function ParlayAnalyzer() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Interactive, price-aware ticket builder (real grades, no fabrication) */}
      <div>
        <InteractiveAnalyzer />
      </div>

      {/* What the analyzer measures */}
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
