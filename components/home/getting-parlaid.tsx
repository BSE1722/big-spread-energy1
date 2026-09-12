import Link from "next/link"
import { ArrowRight, Link2 } from "lucide-react"

/**
 * GETTING PARLAID — now a BSE feature/show, not a quiet card. It explains BSE's
 * leg-strength language (STRONG / QUESTIONABLE / WEAK LINK / CORRELATED RISK)
 * as the concept the analyzer applies. It deliberately does NOT render a fake
 * live parlay with specific leg verdicts — that classification only exists once
 * the gated analyzer runs on a user's real ticket, so the CTA sends them there.
 */

const LEGS = [
  {
    tone: "strong",
    label: "Strong Leg",
    desc: "Clears the BSE line-edge gate with room to spare.",
    className: "border-primary/50 bg-primary/10",
    dot: "bg-primary",
    text: "text-primary",
  },
  {
    tone: "question",
    label: "Questionable Leg",
    desc: "Thin edge — the number barely moves the needle.",
    className: "border-rating-mid/50 bg-rating-mid/10",
    dot: "bg-rating-mid",
    text: "text-rating-mid",
  },
  {
    tone: "weak",
    label: "Weak Link",
    desc: "The market disagrees with BSE. This is where tickets die.",
    className: "border-destructive/50 bg-destructive/10",
    dot: "bg-destructive",
    text: "text-destructive",
  },
  {
    tone: "correlated",
    label: "Correlated Risk",
    desc: "Legs that rise and fall together — hidden shared risk.",
    className: "border-border bg-secondary/50",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
  },
] as const

export function GettingParlaid() {
  return (
    <section className="border-b border-border/60 bg-background py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          {/* Big type */}
          <div>
            <span className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.18em] text-primary">
              A BSE Property
            </span>
            <h2 className="mt-2 font-marker text-6xl leading-[0.85] text-foreground sm:text-7xl xl:text-8xl">
              Getting
              <br />
              <span className="text-primary text-glow">Parlaid.</span>
            </h2>
            <p className="mt-6 max-w-md font-display text-xl font-bold uppercase leading-tight tracking-tight text-foreground sm:text-2xl">
              Your parlay has a weak link.
              <br />
              <span className="text-primary">We&apos;ll find it.</span>
            </p>
            <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
              BSE grades every leg on the model&apos;s spread edge and keeps
              shared-risk legs apart — so instead of chasing a lottery ticket,
              you see exactly where the ticket gets mathematically worse and stop
              there.
            </p>
            <Link
              href="/getting-parlaid"
              className="mt-7 inline-flex h-12 items-center gap-2 rounded-md bg-primary px-7 font-display text-sm font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get Parlaid <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Leg-strength language */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
              <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Link2 className="size-4" />
              </span>
              <div>
                <h3 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                  How BSE Reads A Ticket
                </h3>
                <p className="font-mono text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                  The four verdicts every leg gets
                </p>
              </div>
            </div>
            <ul className="divide-y divide-border/60">
              {LEGS.map((leg) => (
                <li key={leg.tone} className="flex items-start gap-3 px-5 py-4">
                  <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${leg.dot}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <span
                      className={`font-display text-sm font-bold uppercase tracking-wide ${leg.text}`}
                    >
                      {leg.label}
                    </span>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{leg.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="border-t border-border px-5 py-3 font-mono text-[0.625rem] leading-relaxed text-muted-foreground">
              Run your own slip in the analyzer — BSE grades each leg on real
              current lines, never a hardcoded example.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
