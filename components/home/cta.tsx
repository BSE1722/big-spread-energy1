import Link from 'next/link'

export function HomeCta() {
  return (
    <section className="bg-background py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-5 rounded-xl border border-border bg-card px-6 py-8 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-foreground sm:text-3xl">
              Bring The <span className="text-primary">Energy</span>. Cash The
              Ticket.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Become a BSE Pro member today.
            </p>
          </div>
          <Link
            href="/pricing"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-md bg-primary px-8 font-display text-sm font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Join BSE Pro
          </Link>
        </div>
      </div>
    </section>
  )
}
