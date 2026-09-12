import Link from "next/link"
import { BrainCircuit, Crosshair, ShieldCheck, Crown, ArrowRight } from "lucide-react"

/**
 * UNDERSTAND BSE — the longer explanation, moved BELOW the live product per the
 * new hierarchy (FEEL → SEE → USE → UNDERSTAND → TRUST → JOIN). No live data
 * here; it's the evergreen "what BSE is / how it works" material that used to
 * sit at the top of the page.
 */

const PILLARS = [
  {
    icon: Crosshair,
    title: "Fair Spread",
    body: "One independent, model-derived fair line on every game — an estimate of where the number could be, not a copy of the book's.",
  },
  {
    icon: BrainCircuit,
    title: "BSE Edge",
    body: "The gap between the market line and the BSE fair line, in points. It's the whole thesis: where the market and the model disagree.",
  },
  {
    icon: ShieldCheck,
    title: "BSE Rating",
    body: "A 0–100 read on each matchup so you can scan the slate fast and see which games BSE feels strongest about.",
  },
]

export function UnderstandBse() {
  return (
    <section className="border-b border-border/60 bg-background py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <span className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.18em] text-primary">
            Understand BSE
          </span>
          <h2 className="mt-2 font-display text-3xl font-bold uppercase leading-[0.95] tracking-tight text-foreground sm:text-4xl">
            They set the line. <span className="text-primary">We put it on trial.</span>
          </h2>
          <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            BSE isn&apos;t another picks or &ldquo;locks&rdquo; site. It&apos;s an
            independent betting-intelligence platform built to answer one question
            before you wager: do the numbers actually support this bet? Every
            matchup gets its own fair line, edge, and rating — so you&apos;re not
            reading the market&apos;s number, you&apos;re challenging it.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-card p-6">
              <p.icon className="h-8 w-8 text-primary" strokeWidth={1.75} />
              <h3 className="mt-4 font-display text-xl font-bold uppercase tracking-wide text-foreground">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-6 md:col-span-2">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              <h3 className="font-display text-sm font-bold uppercase tracking-wide text-primary">
                The BSE Model
              </h3>
            </div>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
              A frozen, versioned model produces the base BSE fair spread. A
              separate, fully documented context layer sits on top of it — and it
              only moves the number when it has real data the base model
              doesn&apos;t already contain. Where a factor is already priced in,
              or where no provider is wired, BSE says so instead of pretending.
              It&apos;s a research signal under live validation, not a guarantee.
            </p>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-6">
            <div>
              <Crown className="h-8 w-8 text-primary" strokeWidth={1.75} />
              <h3 className="mt-4 font-display text-xl font-bold uppercase tracking-wide text-foreground">
                BSE Pro
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Unlock every breakdown on the board — all tools, all edges, no
                weekly limit.
              </p>
            </div>
            <Link
              href="/pricing"
              className="mt-5 inline-flex min-h-11 items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-primary hover:text-primary/80"
            >
              Join BSE Pro <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
