import { SectionEyebrow } from "./section-eyebrow"

const steps = [
  { title: "Gear Up", body: "Shop BSE Supply during a future active promotion." },
  { title: "Build Your Locker", body: "Eligible promotional entries could appear in your BSE Locker." },
  { title: "The Drawing", body: "A winner would be selected according to the applicable Official Rules." },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-20 sm:px-6 md:py-28">
        <div className="flex flex-col gap-4">
          <SectionEyebrow>The Playbook</SectionEyebrow>
          <h2 id="how-title" className="font-display text-5xl font-bold uppercase leading-none sm:text-6xl">
            How Game Day Works
          </h2>
        </div>

        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="relative flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card p-6">
              <span className="font-mono text-xs uppercase tracking-[0.25em] text-primary">Step {String(i + 1).padStart(2, "0")}</span>
              <span
                className="pointer-events-none absolute -right-2 -top-6 font-display text-[8rem] font-bold leading-none text-foreground/5"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <h3 className="font-display text-3xl font-bold uppercase">{step.title}</h3>
              <p className="leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-1 rounded-xl border border-foreground/20 bg-background p-6 font-display text-lg font-semibold uppercase leading-snug tracking-wide sm:text-xl">
          <p className="text-primary">Game Day is currently a prototype.</p>
          <p className="text-foreground">No promotion is active.</p>
          <p className="text-foreground">No purchase currently earns BSE Game Day entries.</p>
        </div>
      </div>
    </section>
  )
}
