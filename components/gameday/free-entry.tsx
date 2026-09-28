import { Info } from "lucide-react"
import { DemoModal } from "./demo-modal"

export function FreeEntry() {
  return (
    <section aria-labelledby="free-entry-title" className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 md:pb-28">
      <div className="flex flex-col gap-6 rounded-xl border border-dashed border-foreground/25 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex flex-col gap-2">
          <h2 id="free-entry-title" className="font-display text-4xl font-bold uppercase">
            No Purchase?
          </h2>
          <p className="max-w-xl leading-relaxed text-muted-foreground text-pretty">
            Future BSE promotions are intended to include an alternative free method of entry.
          </p>
        </div>
        <DemoModal
          title="Free Entry Information"
          triggerLabel={
            <>
              <Info className="size-5" aria-hidden="true" />
              Free Entry Information
            </>
          }
          triggerClassName="min-h-14 justify-center rounded-md border border-primary px-6 hover:bg-primary hover:text-primary-foreground"
        >
          <div className="flex flex-col gap-3 font-display text-lg font-semibold uppercase leading-snug tracking-wide">
            <p className="text-primary">BSE Game Day is currently a prototype.</p>
            <p>Official free-entry instructions will be published if and when a promotion is launched.</p>
          </div>
        </DemoModal>
      </div>
    </section>
  )
}
