import Link from 'next/link'
import Image from 'next/image'
import { TrendingUp, ShieldCheck, Crosshair } from 'lucide-react'
import { HeroPreviewCard } from '@/components/home/hero-preview-card'

// Describes what the BSE model measures — a spread read only, no fabricated
// performance or win-probability claims.
const stats = [
  { icon: TrendingUp, value: 'Edge', label: 'Points vs the Market' },
  { icon: ShieldCheck, value: '0–100', label: 'BSE Signal Rating' },
  { icon: Crosshair, value: 'Fair', label: 'Spread vs Market Line' },
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
            BSE estimates where the line could be.
          </p>

          <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every matchup. Every line. One BSE rating built to show you where the market looks right - and where it might not. <br />
            Ready to bet outside the box? Don't just read the lines. Challenge them! <br />
            <br />
            They set the line. We put it on trial.<br />
            <br />
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

        {/* Right: phone card — real current-week featured matchup */}
        <div className="relative z-20 flex items-center justify-center lg:col-span-3">
          <HeroPreviewCard />
        </div>
      </div>
    </section>
  )
}
