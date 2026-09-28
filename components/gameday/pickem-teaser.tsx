import { DEMO_LEADERBOARD } from "@/lib/gameday/config"
import { cn } from "@/lib/utils"
import { DemoTag, SectionEyebrow } from "./section-eyebrow"

export function PickemTeaser() {
  return (
    <section aria-labelledby="pickem-title" className="relative overflow-hidden border-y border-border bg-card">
      <div className="absolute inset-0 grid-lines" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-20 sm:px-6 md:grid-cols-2 md:items-center md:py-28">
        <div className="flex flex-col gap-5">
          <SectionEyebrow>BSE Saturday Pick&apos;em</SectionEyebrow>
          <h2 id="pickem-title" className="font-display text-[clamp(3rem,12vw,6rem)] font-bold uppercase leading-[0.88]">
            15 Games.
            <br />
            <span className="text-primary">One Board.</span>
          </h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Make your picks.
            <br />
            Beat the BSE community.
            <br />
            Climb the season leaderboard.
          </p>
          <span className="inline-flex min-h-12 items-center self-start rounded-md border border-foreground/25 px-5 font-display text-base font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Coming Soon
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-3">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Season Leaderboard</span>
            <DemoTag />
          </div>
          <ol>
            {DEMO_LEADERBOARD.map((row, i) => {
              const isModel = "isModel" in row && row.isModel
              return (
                <li
                  key={row.name}
                  className={cn(
                    "flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0",
                    isModel && "bg-accent",
                  )}
                >
                  <span className="w-6 font-display text-2xl font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className={cn("min-w-0 flex-1 truncate font-medium", isModel && "text-primary")}>{row.name}</span>
                  <span className="font-display text-xl font-bold tabular-nums">{row.record}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
