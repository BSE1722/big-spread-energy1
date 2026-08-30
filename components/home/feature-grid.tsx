import Link from 'next/link'
import { BrainCircuit, Crown, ArrowRight } from 'lucide-react'

export function FeatureGrid() {
  return (
    <section className="border-b border-border/60 bg-background py-14">
      <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
        {/* Getting Parlaid */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6">
          <div className="relative z-10 max-w-[62%]">
            <h3 className="font-marker text-3xl leading-none text-foreground">
              Getting
              <br />
              <span className="text-primary">Parlaid</span>
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Stop chasing lottery tickets. Getting Parlaid grades each leg on
              the model&apos;s spread edge and keeps shared-risk legs apart to
              build smarter parlays — a realistic build instead of a payout
              chased on tiny odds.
            </p>
            <Link
              href="/getting-parlaid"
              className="mt-5 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              View This Week&apos;s Parlay <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {/* play diagram */}
          <PlayDiagram />
        </div>

        {/* BSE Model */}
        <FeatureCard
          icon={BrainCircuit}
          title="BSE Model"
          body="Proprietary models. Real-time data. LINES MOVE. WE REACT. FIND THE EDGE BEFORE IT'S GONE."
          cta="How We Do It"
          href="/board"
        />

        {/* BSE Pro */}
        <FeatureCard
          icon={Crown}
          title="BSE Pro"
          body="Unlock the full power of BSE. All tools. All models. All edges."
          cta="Join BSE Pro"
          href="/pricing"
        />
      </div>
    </section>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  cta,
  href,
}: {
  icon: typeof Crown
  title: string
  body: string
  cta: string
  href: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <Icon className="h-9 w-9 text-primary" strokeWidth={1.5} />
      <h3 className="mt-4 font-display text-xl font-bold uppercase tracking-wide text-foreground">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <Link
        href={href}
        className="mt-5 inline-flex items-center rounded-md border border-border px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary"
      >
        {cta}
      </Link>
    </div>
  )
}

function PlayDiagram() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="pointer-events-none absolute -right-2 top-4 h-32 w-32 text-primary/70"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      {/* X markers */}
      <path d="M14 18 l8 8 M22 18 l-8 8" />
      <path d="M34 14 l8 8 M42 14 l-8 8" />
      <path d="M54 18 l8 8 M62 18 l-8 8" />
      {/* O markers */}
      <circle cx="20" cy="52" r="5" />
      <circle cx="40" cy="52" r="5" />
      <circle cx="60" cy="52" r="5" />
      {/* routes */}
      <path d="M20 60 q 6 22 24 26" strokeDasharray="3 3" />
      <path d="M40 60 l 14 30" strokeDasharray="3 3" />
      <path d="M60 60 q -4 20 -20 28" strokeDasharray="3 3" />
      {/* arrow tips */}
      <path d="M44 86 l-2 6 l6 -2" fill="currentColor" stroke="none" />
      <path d="M54 90 l-2 6 l6 -2" fill="currentColor" stroke="none" />
    </svg>
  )
}
