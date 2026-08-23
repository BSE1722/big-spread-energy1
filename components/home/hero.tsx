import Link from 'next/link'
import Image from 'next/image'
import { TrendingUp, ShieldCheck, Crosshair, Zap, Menu } from 'lucide-react'
import { getTeamRank } from '@/lib/bse'

// A real Week 1 2026 marquee matchup, used as the illustrative Pro sample card.
function rankedName(name: string) {
  const rank = getTeamRank(name)
  return rank != null ? `#${rank} ${name}` : name
}

// Describes what the BSE model measures — not fabricated performance claims.
const stats = [
  { icon: TrendingUp, value: 'EV', label: 'Value-Graded Bets' },
  { icon: ShieldCheck, value: '0–100', label: 'BSE Confidence Rating' },
  { icon: Crosshair, value: 'Fair', label: 'Line vs Market Edge' },
]

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-background">
      {/* green energy glow behind player */}
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center">
        <div className="radial-fade mt-10 h-[620px] w-[620px] max-w-full" />
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-8 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-12 lg:gap-4 lg:px-8 lg:pb-20 lg:pt-14">
        {/* Left: copy */}
        <div className="relative z-20 flex flex-col justify-center lg:col-span-5">
          <span className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-primary">
            College Football Analytics
          </span>

          <h1 className="mt-4 font-display font-bold uppercase leading-[0.82] tracking-tight">
            <span className="block text-6xl text-foreground text-glow-strong sm:text-7xl xl:text-8xl">
              Big Spread
            </span>
            <span className="mt-1 block font-marker text-6xl normal-case text-primary text-glow sm:text-7xl xl:text-8xl">
              Energy
            </span>
          </h1>

          <p className="mt-6 max-w-md text-pretty text-lg font-semibold leading-relaxed text-foreground sm:text-xl">
            THEIR LINE. OUR LINE. YOUR EDGE.
            Sportsbooks tell you what the line is. 
            BSE calculates where the line SHOULD be. 
          </p>

          <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every matchup. Every line. One proprietary BSE rating buit to show you where the market looks right - and where it doesn't.
            Ready to bet outside the box? Don't just read the lines. Challenge them!
            
            Or use our tools to fill your pockets. The house doesn't always win. 
            
            BSE isn't another picks or "locks" site.
            It's an independent betting intelligence platform built to answer one questions before you wager:
           Do the numbers actually support this bet?
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-7 font-display text-sm font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get BSE Pro
            </Link>
            <Link
              href="/board"
              className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-card/40 px-7 font-display text-sm font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              See The Board
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-5">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-2.5">
                <s.icon className="h-6 w-6 shrink-0 text-primary" strokeWidth={2} />
                <div>
                  <div className="font-display text-xl font-bold leading-none text-foreground">
                    {s.value}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center: player */}
        <div className="relative z-10 flex items-center justify-center lg:col-span-4">
          <div className="animate-hero-float relative w-full max-w-md">
            {/* Moving green energy behind the player */}
            <div
              aria-hidden
              className="animate-energy-drift absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.86_0.24_148_/_0.55)_0%,transparent_65%)] blur-2xl"
            />
            <div
              aria-hidden
              className="animate-energy-drift-slow absolute left-[42%] top-[58%] h-[55%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.86_0.24_148_/_0.4)_0%,transparent_60%)] blur-3xl"
            />
            <Image
              src="/images/hero-player.png"
              alt="Football player wrapped in Big Spread Energy green"
              width={640}
              height={640}
              priority
              className="animate-energy-flicker relative z-10 h-auto w-full object-contain [mask-image:radial-gradient(ellipse_70%_75%_at_50%_45%,#000_55%,transparent_88%)] [-webkit-mask-image:radial-gradient(ellipse_70%_75%_at_50%_45%,#000_55%,transparent_88%)]"
            />
          </div>
        </div>

        {/* Right: phone card */}
        <div className="relative z-20 flex items-center justify-center lg:col-span-3">
          <PhoneCard />
        </div>
      </div>
    </section>
  )
}

function PhoneCard() {
  return (
    <div className="w-full max-w-[290px] rounded-[2.2rem] border border-border bg-card p-2 shadow-[0_0_50px_oklch(0_0_0_/_0.6)] ring-1 ring-primary/10">
      <div className="overflow-hidden rounded-[1.7rem] bg-secondary">
        {/* phone header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-1">
            <span className="font-display text-lg font-bold text-foreground">BS</span>
            <span className="font-display text-lg font-bold text-primary">E</span>
          </div>
          <span className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            BSE Pro
          </span>
          <Menu className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* rating */}
        <div className="flex flex-col items-center px-4 py-6 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            BSE Rating
          </span>
          <span className="my-1 font-display text-7xl font-bold leading-none text-primary text-glow">
            87
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Big Spread Alert
          </span>
          <Zap className="mt-2 h-4 w-4 fill-primary text-primary" />
        </div>

        {/* matchup — real Week 1 game, illustrative sample numbers */}
        <div className="border-t border-border/60 px-4 py-4">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              {rankedName('Louisville')} @ {rankedName('Ole Miss')}
            </span>
          </div>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Week 1 · BSE Choice
          </span>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Market Spread" value="MISS -6.5" />
            <Row label="BSE Projection" value="-8.5" />
            <div className="flex items-center justify-between border-t border-border/60 pt-2">
              <dt className="font-semibold text-primary">Spread Edge</dt>
              <dd className="font-display text-base font-bold text-primary">+2.0</dd>
            </div>
          </dl>
         <Link
            href="/board"
            className="mt-4 block w-full rounded-md border border-border py-2.5 text-center font-display text-xs font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary"
>
    View Full Breakdown
    </Link>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono font-semibold text-foreground">{value}</dd>
    </div>
  )
}
