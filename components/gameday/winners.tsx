import { SectionEyebrow } from "./section-eyebrow"

export function Winners() {
  return (
    <section aria-labelledby="winners-title" className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 md:py-28">
      <div className="flex flex-col items-center gap-5 text-center">
        <SectionEyebrow>BSE Winners</SectionEyebrow>
        <h2 id="winners-title" className="max-w-3xl font-display text-4xl font-bold uppercase leading-tight text-balance sm:text-6xl">
          The first BSE Game Day winner <span className="text-primary">could be you.</span>
        </h2>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Coming Soon</p>
      </div>
    </section>
  )
}
