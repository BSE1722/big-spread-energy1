const steps = [
  {
    n: "01",
    title: "We model the game",
    desc: "BSE ratings turn team, matchup, pace, and situational data into a projected fair spread and total.",
  },
  {
    n: "02",
    title: "We compare the market",
    desc: "Fair lines are stacked against live sportsbook numbers to surface points of edge in real time.",
  },
  {
    n: "03",
    title: "You place the edge",
    desc: "Grade single bets or full parlays, then track results and ROI across the season.",
  },
]

export function HowItWorks() {
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            How it works
          </span>
          <h2 className="mt-3 text-balance font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
            From raw data to real edge
          </h2>
        </div>

        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="relative border-t border-primary/40 pt-6">
              <span className="font-mono text-sm font-semibold text-primary">
                {s.n}
              </span>
              <h3 className="mt-3 font-display text-2xl font-bold uppercase tracking-tight text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {s.desc}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
