export function PrototypeNotice() {
  return (
    <aside aria-labelledby="prototype-notice-title" className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-10 sm:px-6">
        <h2 id="prototype-notice-title" className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          Game Day Prototype Notice
        </h2>
        <div className="flex max-w-3xl flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          <p>Game Day is currently a product prototype.</p>
          <p>No sweepstakes, contest or promotion is currently being offered through this page.</p>
          <p>Prizes, entries, multipliers and dates displayed on this page are demonstration data only.</p>
        </div>
      </div>
    </aside>
  )
}
