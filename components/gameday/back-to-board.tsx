import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function BackToBoard() {
  return (
    <section aria-labelledby="numbers-title" className="relative overflow-hidden border-t border-primary/30 bg-accent">
      <div className="absolute inset-0 yard-lines opacity-50" aria-hidden="true" />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-20 sm:px-6 md:py-28">
        <h2 id="numbers-title" className="font-display text-[clamp(2.5rem,10vw,5.5rem)] font-bold uppercase leading-[0.9] text-balance">
          The giveaway is fun.
          <br />
          <span className="text-primary text-glow">The numbers are why we&apos;re here.</span>
        </h2>
        <p className="max-w-xl text-lg leading-relaxed text-foreground/80 text-pretty">
          Bring us the bet you&apos;re thinking about making. We&apos;ll tell you whether the numbers actually support it.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/board"
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-primary px-7 font-display text-lg font-semibold uppercase tracking-wide text-primary-foreground transition hover:brightness-110"
          >
            Open the BSE Board
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
          <Link
            href="/getting-parlaid"
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-md border border-foreground/30 px-7 font-display text-lg font-semibold uppercase tracking-wide text-foreground transition hover:border-primary hover:text-primary"
          >
            Build My Parlay
          </Link>
        </div>
      </div>
    </section>
  )
}
