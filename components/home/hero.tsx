import Link from "next/link"
import { ArrowUpRight, TrendingUp } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { games, formatSpread } from "@/lib/data"
import { EdgeBadge } from "@/components/edge-badge"
import { cn } from "@/lib/utils"

export function Hero() {
  const featured = games.slice(0, 3)

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 grid-lines opacity-70" aria-hidden="true" />
      <div
        className="absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div className="flex flex-col justify-center">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-xs uppercase tracking-[0.2em] text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary [animation:live-pulse_1.6s_ease-in-out_infinite]" />
            </span>
            Week 11 lines are live
          </span>

          <h1 className="mt-6 text-balance font-display text-5xl font-bold uppercase leading-[0.92] tracking-tight sm:text-6xl lg:text-7xl">
            Bet with an
            <span className="text-primary text-glow"> edge</span>, not a hunch.
          </h1>

          <p className="mt-6 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Big Spread Energy projects fair lines for every college football
            game, scores the edge against the market, and rates your parlays
            before you place them. Terminal-grade analytics for real bettors.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/board"
              className={cn(
                buttonVariants({ variant: "default" }),
                "h-12 gap-2 px-6 font-display text-base font-semibold uppercase tracking-wide",
              )}
            >
              View The Board
              <ArrowUpRight className="size-5" />
            </Link>
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-12 px-6 font-display text-base font-semibold uppercase tracking-wide",
              )}
            >
              Go Pro
            </Link>
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-border pt-6">
            {[
              { k: "Fair lines / week", v: "130+" },
              { k: "Season ROI", v: "+14.2%" },
              { k: "Edge picks graded", v: "2.4K" },
            ].map((s) => (
              <div key={s.k}>
                <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  {s.k}
                </dt>
                <dd className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Terminal preview card */}
        <div className="relative flex items-center">
          <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <TrendingUp className="size-4 text-primary" />
                The Board — Top Edges
              </div>
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary [animation:live-pulse_1.6s_ease-in-out_infinite]" />
                Live
              </span>
            </div>
            <div className="divide-y divide-border">
              {featured.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="font-display text-sm font-semibold text-foreground">
                      {g.away.abbr} <span className="text-muted-foreground">@</span> {g.home.abbr}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {g.kickoff} · {g.network}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div className="font-mono text-xs">
                      <div className="text-muted-foreground">MKT {formatSpread(g.marketSpread)}</div>
                      <div className="text-primary">FAIR {formatSpread(g.fairSpread)}</div>
                    </div>
                    <EdgeBadge edge={g.edgeSpread} />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border bg-secondary/40 px-4 py-3 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              BSE fair line model · updated 2m ago
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
