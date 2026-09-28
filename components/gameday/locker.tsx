import { ArrowRight } from "lucide-react"
import { DEMO_ENTRY_HISTORY, DEMO_LOCKER } from "@/lib/gameday/config"
import { DemoModal } from "./demo-modal"
import { DemoTag, SectionEyebrow } from "./section-eyebrow"

const fmt = new Intl.NumberFormat("en-US")

export function BseLocker() {
  const { entries, multiplier, countdown, entryLimit } = DEMO_LOCKER
  const pct = Math.min(100, (entries / entryLimit) * 100)

  return (
    <section aria-labelledby="locker-title" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 md:py-24">
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card">
        <div className="absolute inset-0 grid-lines opacity-60" aria-hidden="true" />
        <div className="relative flex flex-col gap-8 p-6 sm:p-10">
          <div className="flex items-center justify-between gap-4">
            <SectionEyebrow>Preview</SectionEyebrow>
            <DemoTag />
          </div>

          <div className="flex flex-col gap-2">
            <h2 id="locker-title" className="font-display text-3xl font-bold uppercase sm:text-4xl">
              Your BSE Locker
            </h2>
            <p className="flex items-baseline gap-3">
              <span className="font-display text-7xl font-bold leading-none text-primary text-glow tabular-nums sm:text-8xl">
                {fmt.format(entries)}
              </span>
              <span className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">Demo Entries</span>
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/70 p-5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Current Demo Multiplier</dt>
              <dd className="font-display text-4xl font-bold text-primary">{multiplier}</dd>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/70 p-5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Demo Promotion Ends</dt>
              <dd className="flex items-baseline gap-1 font-display text-4xl font-bold tabular-nums text-foreground">
                {countdown.days}
                <span className="text-lg text-muted-foreground">D</span>
                <span className="px-0.5 text-primary" aria-hidden="true">:</span>
                {countdown.hours}
                <span className="text-lg text-muted-foreground">H</span>
                <span className="px-0.5 text-primary" aria-hidden="true">:</span>
                {countdown.minutes}
                <span className="text-lg text-muted-foreground">M</span>
              </dd>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/70 p-5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Demo Entry Limit</dt>
              <dd className="flex flex-col gap-3">
                <span className="font-display text-4xl font-bold tabular-nums text-foreground">
                  {fmt.format(entries)}
                  <span className="text-xl text-muted-foreground"> / {fmt.format(entryLimit)}</span>
                </span>
                <span
                  role="progressbar"
                  aria-label="Demo entry limit progress"
                  aria-valuemin={0}
                  aria-valuemax={entryLimit}
                  aria-valuenow={entries}
                  className="block h-2 overflow-hidden rounded-full bg-muted"
                >
                  <span
                    className="block h-full rounded-full bg-primary shadow-[0_0_12px_var(--primary)]"
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </dd>
            </div>
          </dl>

          <DemoModal
            title="Demo Entry History"
            triggerLabel={
              <>
                View Demo Entry History
                <ArrowRight className="size-5" aria-hidden="true" />
              </>
            }
            triggerClassName="self-start"
          >
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {DEMO_ENTRY_HISTORY.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-4 p-4">
                  <span className="flex flex-col gap-1">
                    <span className="font-medium">{item.source}</span>
                    <DemoTag className="self-start" />
                  </span>
                  <span className="font-display text-xl font-bold tabular-nums text-primary">
                    +{fmt.format(item.entries)}
                    <span className="block text-right font-mono text-[10px] font-normal uppercase tracking-[0.15em] text-muted-foreground">
                      Demo Entries
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Sample data for illustration only. Nothing here is saved or tied to your account.
            </p>
          </DemoModal>
        </div>
      </div>
    </section>
  )
}
