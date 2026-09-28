import Image from "next/image"
import { ChevronDown, Zap } from "lucide-react"
import { SupplyLink } from "./supply-link"

export function GameDayHero() {
  return (
    <section
      aria-labelledby="gameday-hero-title"
      className="relative isolate flex min-h-[calc(100svh-4rem)] items-center overflow-hidden border-b border-border"
    >
      <Image
        src="/images/gameday-stadium.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover object-center opacity-60"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/70 via-background/55 to-background" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-1/3 yard-lines opacity-60" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -top-1/4 left-1/2 -z-10 h-[140%] w-[70%] -translate-x-1/2 animate-light-sweep bg-[radial-gradient(ellipse_at_top,oklch(0.86_0.24_148/0.22),transparent_60%)]"
        aria-hidden="true"
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:py-20">
        <p
          className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.3em] text-primary animate-signal-in"
        >
          <Zap className="size-4 fill-primary" aria-hidden="true" />
          BSE Game Day
        </p>

        <h1 id="gameday-hero-title" className="flex flex-col font-display font-bold uppercase leading-[0.82]">
          <span className="text-[clamp(2.75rem,12vw,6rem)] text-foreground animate-signal-in [animation-delay:80ms]">
            Win
          </span>
          <span className="text-[clamp(5rem,24vw,15rem)] tracking-tight text-primary text-glow-strong tabular-nums animate-signal-in [animation-delay:160ms]">
            $10,000
          </span>
          <span className="text-[clamp(2.75rem,12vw,6rem)] text-foreground animate-signal-in [animation-delay:240ms]">
            Cash
          </span>
        </h1>

        <div className="-rotate-2 animate-signal-in rounded-md border-2 border-primary bg-background/80 px-4 py-2 shadow-[0_0_40px_-12px_var(--primary)] [animation-delay:320ms]">
          <p className="font-display text-2xl font-bold uppercase leading-none tracking-wide text-primary sm:text-3xl">
            25X Entries
          </p>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.25em] text-foreground">This Weekend</p>
        </div>

        <p className="max-w-md text-lg leading-relaxed text-muted-foreground text-pretty animate-signal-in [animation-delay:400ms]">
          College football Saturdays just got bigger.
        </p>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row animate-signal-in [animation-delay:480ms]">
          <SupplyLink className="w-full sm:w-auto" />
          <a
            href="#how-it-works"
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md border border-foreground/25 bg-background/40 px-7 font-display text-lg font-semibold uppercase tracking-wide text-foreground backdrop-blur transition hover:border-primary hover:text-primary sm:w-auto"
          >
            How It Works
            <ChevronDown className="size-5" aria-hidden="true" />
          </a>
        </div>

        <p className="rounded border border-border bg-background/70 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Prototype — No promotion currently active
        </p>
      </div>
    </section>
  )
}
