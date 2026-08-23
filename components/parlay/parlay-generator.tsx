"use client"

import { Dice5, Clock, Target, ShieldCheck, Rocket } from "lucide-react"
import { CurrentWeekSlate } from "@/components/parlay/current-week-slate"

/**
 * Getting Parlaid — BSE's parlay builder.
 *
 * BSE constructs optimized tickets from its own model output (joint
 * probability, expected value, confidence, correlation). Those projections are
 * not published yet for the live board, so this surface does NOT fabricate a
 * ticket. It explains what the tool optimizes for and shows the real
 * current-week slate the generator will draw from. When the model begins
 * emitting ratings/edges on /api/cfbd-board, generation activates here.
 */

const OBJECTIVES = [
  {
    icon: Target,
    label: "Sweet Spot",
    description: "Balanced risk and reward — BSE's default optimization target.",
  },
  {
    icon: ShieldCheck,
    label: "Safe(r) Build",
    description: "Higher joint hit probability with tighter correlation control.",
  },
  {
    icon: Rocket,
    label: "Long Shot",
    description: "Maximum payout while still clearing BSE's value threshold.",
  },
]

export function ParlayGenerator() {
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* What BSE optimizes for (informational — no fabricated ticket) */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            <Dice5 className="size-4 text-primary" />
            What BSE optimizes for
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            {OBJECTIVES.map((o) => (
              <div key={o.label} className="rounded-lg border border-border px-4 py-3">
                <span className="flex items-center gap-2">
                  <o.icon className="size-4 text-primary" />
                  <span className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
                    {o.label}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {o.description}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
            BSE evaluates combinations and only recommends a ticket that clears
            its probability, value, confidence, and correlation thresholds — it
            will decline rather than force a bet.
          </p>
        </div>
      </div>

      {/* Honest pending state + the real slate the generator will draw from */}
      <div className="space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-5">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock className="size-5" />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-foreground">
              Ticket generation activates when this week&apos;s BSE projections publish
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Getting Parlaid builds tickets from the BSE model&apos;s ratings and edges.
              Those aren&apos;t out for the current board yet, so we won&apos;t invent a
              ticket or fake its odds. Below is the real slate the generator will
              draw from — the moment the model runs, optimized tickets appear here.
            </p>
          </div>
        </div>

        <CurrentWeekSlate />
      </div>
    </div>
  )
}
