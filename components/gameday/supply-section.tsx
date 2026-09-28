import { Flame } from "lucide-react"
import { SupplyLink } from "./supply-link"
import { SectionEyebrow } from "./section-eyebrow"

export function SupplySection() {
  return (
    <section id="bse-supply" aria-labelledby="supply-title" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
      <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-2xl flex-col gap-5">
          <SectionEyebrow>BSE Supply</SectionEyebrow>
          <h2 id="supply-title" className="font-display text-[clamp(3rem,12vw,6.5rem)] font-bold uppercase leading-[0.88] text-balance">
            Gear up for <span className="text-primary">Saturday.</span>
          </h2>
          <p className="text-lg leading-relaxed text-muted-foreground text-pretty">
            BSE gear built for Saturdays, parlays and bad decisions with the boys.
          </p>
        </div>

        <div className="flex flex-col gap-5 md:max-w-sm">
          <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-accent px-4 py-3">
            <Flame className="size-6 shrink-0 fill-primary text-primary" aria-hidden="true" />
            <p className="font-display text-xl font-bold uppercase tracking-wide text-foreground">25X Demo Entry Weekend</p>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Future qualifying BSE Supply purchases may receive promotional entries during active BSE Game Day promotions,
            subject to Official Rules.
          </p>
          <div className="flex flex-col gap-2">
            <SupplyLink className="w-full" />
            <p className="text-center font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">External Store</p>
          </div>
        </div>
      </div>
    </section>
  )
}
