"use client"

import { Clock, Scale, Layers, TriangleAlert } from "lucide-react"
import { CurrentWeekSlate } from "@/components/parlay/current-week-slate"

/**
 * Parlay Analyzer — grades every spread leg on a ticket.
 *
 * The grade is derived from the BSE model's per-game SPREAD read: the model's
 * fair spread vs the book's line gives a per-leg edge in points and a lean. The
 * model does not output a win probability or EV, so this surface never claims
 * one. Those spread reads aren't published for the live board yet, so it shows
 * an honest pending state plus the real current-week slate it will grade.
 */

const MEASURES = [
  {
    icon: Scale,
    label: "Every spread leg, graded",
    description:
      "The model's fair spread vs the book's line for each leg — an edge in points and a lean, not a hunch.",
  },
  {
    icon: Layers,
    label: "Ticket-wide edge",
    description:
      "Totals the per-leg spread edge across the ticket so you see which legs carry it and which drag it down.",
  },
  {
    icon: TriangleAlert,
    label: "Shared-risk flags",
    description:
      "Flags legs from the same game or heavily related spots, so overlapping bets aren't treated as independent.",
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
              Grading activates when this week&apos;s BSE spread reads publish
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              The analyzer grades each spread leg against the BSE model&apos;s fair
              spread. Those reads aren&apos;t out for the current board yet, so we
              won&apos;t show fabricated edges or a verdict. Below is the real
              current-week slate whose legs it will grade the moment the model runs.
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
