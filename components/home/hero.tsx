import Link from 'next/link'
import Image from 'next/image'
import { HeroLiveSignal } from '@/components/home/hero-live-signal'

/**
 * Above-the-fold: FEEL BSE. Brand wordmark + the "THEIR LINE / OUR LINE / YOUR
 * EDGE" promise, then one real live BSE signal (see HeroLiveSignal). All the
 * longer explanation now lives further down the page in "Understand BSE".
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-background">
      {/* Energy glow + faint stadium texture */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="grid-lines absolute inset-0 opacity-40" />
        <div className="radial-fade absolute left-1/2 top-0 h-[560px] w-[560px] max-w-full -translate-x-1/2" />
      </div>

      {/* Faint player texture, right side, desktop only — decorative */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-1/2 hidden -translate-y-1/2 opacity-20 lg:block"
      >
        <Image
          src="/images/hero-player.png"
          alt=""
          width={620}
          height={620}
          priority
          className="h-[620px] w-auto object-contain [mask-image:radial-gradient(ellipse_60%_60%_at_50%_45%,#000_40%,transparent_80%)] [-webkit-mask-image:radial-gradient(ellipse_60%_60%_at_50%_45%,#000_40%,transparent_80%)]"
        />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-8 lg:pb-20 lg:pt-16">
        {/* Left: brand + promise */}
        <div className="relative z-10 flex flex-col">
          <span className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-primary sm:text-sm">
            College Football Betting Intelligence
          </span>

          <h1 className="mt-4 font-display font-bold uppercase leading-[0.82] tracking-tight">
            <span className="block text-[3.25rem] text-foreground text-glow-strong sm:text-7xl xl:text-8xl">
              Big Spread
            </span>
            <span className="mt-1 block font-marker text-[3.25rem] normal-case text-primary text-glow sm:text-7xl xl:text-8xl">
              Energy
            </span>
          </h1>

          <p className="mt-6 font-display text-2xl font-bold uppercase leading-tight tracking-tight text-foreground sm:text-3xl">
            Their line.
            <br />
            Our line.
            <br />
            <span className="text-primary text-glow">Your edge.</span>
          </p>

          <p className="mt-5 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Sportsbooks tell you what the line is. BSE estimates where the line
            could be — one independent rating on every game, built to show you
            where the market looks right and where it might not.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/board"
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-7 font-display text-sm font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
            >
              See The Board
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-card/40 px-7 font-display text-sm font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Get BSE Pro
            </Link>
          </div>
        </div>

        {/* Right: real live signal */}
        <div className="relative z-10 flex justify-center lg:justify-end">
          <HeroLiveSignal />
        </div>
      </div>
    </section>
  )
}
