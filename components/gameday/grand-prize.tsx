import { DEMO_PRIZES } from "@/lib/gameday/config"
import { DemoTag, SectionEyebrow } from "./section-eyebrow"

export function GrandPrize() {
  return (
    <section aria-labelledby="prize-title" className="relative overflow-hidden border-y border-border bg-card/40">
      <div className="absolute inset-0 yard-lines opacity-40" aria-hidden="true" />
      <div className="absolute inset-0 radial-fade" aria-hidden="true" />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-4 py-20 sm:px-6 md:py-28">
        <div className="flex flex-col items-center gap-4 text-center">
          <SectionEyebrow>The Saturday Bag</SectionEyebrow>
          <h2 id="prize-title" className="font-display text-[clamp(3.5rem,16vw,9rem)] font-bold uppercase leading-[0.85] text-foreground">
            <span className="text-primary text-glow-strong">$10,000</span> Cash
          </h2>
          <p className="font-display text-xl uppercase leading-snug tracking-wide text-muted-foreground sm:text-2xl">
            One winner.
            <br />
            One ridiculous Saturday.
          </p>
        </div>

        <ol className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {DEMO_PRIZES.map((prize, i) => (
            <li
              key={prize.tier}
              className={
                i === 0
                  ? "flex items-center justify-between gap-4 rounded-lg border-2 border-primary bg-background/80 p-5 shadow-[0_0_48px_-16px_var(--primary)] sm:p-6"
                  : "flex items-center justify-between gap-4 rounded-lg border border-border bg-background/80 p-5 sm:p-6"
              }
            >
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{prize.tier}</span>
              <span className="flex flex-col items-end text-right">
                <span
                  className={
                    i === 0
                      ? "font-display text-3xl font-bold tabular-nums text-primary sm:text-4xl"
                      : "font-display text-2xl font-bold tabular-nums text-foreground sm:text-3xl"
                  }
                >
                  {prize.value}
                </span>
                <span className="text-sm text-muted-foreground">{prize.detail}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Demo Drawing Date <span className="text-foreground">December XX, 2026</span>
          </p>
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <DemoTag /> Prize structure — conceptual values only
          </p>
        </div>
      </div>
    </section>
  )
}
