import Link from "next/link"
import { LineChart, Gauge, Layers, Sparkles, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

const features = [
  {
    icon: LineChart,
    title: "BSE Fair Lines",
    desc: "A power-rating model projects a true fair spread and total for every game, independent of the market.",
    href: "/board",
    span: "lg:col-span-2",
  },
  {
    icon: Gauge,
    title: "Edge Scores",
    desc: "See exactly how many points of value sit between the market number and our fair line.",
    href: "/board",
    span: "",
  },
  {
    icon: Sparkles,
    title: "BSE Ratings",
    desc: "Every team is graded 0–100 on offense, defense, and overall strength, updated weekly.",
    href: "/board",
    span: "",
  },
  {
    icon: Layers,
    title: "Parlay Analyzer",
    desc: "Paste any parlay and get a combined edge, fair price, and hit-probability breakdown per leg.",
    href: "/parlay-analyzer",
    span: "lg:col-span-2",
  },
]

export function FeatureGrid() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="max-w-2xl">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          The system
        </span>
        <h2 className="mt-3 text-balance font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          A terminal built for beating the number
        </h2>
        <p className="mt-4 text-pretty text-muted-foreground">
          Everything you need to find value, size your plays, and stop guessing —
          in one fast, no-nonsense dashboard.
        </p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <Link
            key={f.title}
            href={f.href}
            className={cn(
              "group flex flex-col justify-between rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50",
              f.span,
            )}
          >
            <div>
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-5 font-display text-xl font-semibold uppercase tracking-tight text-foreground">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.desc}
              </p>
            </div>
            <span className="mt-6 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-primary">
              Explore
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
