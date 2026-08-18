import Image from 'next/image'
import { AtSign, Camera, Play, Music2, LineChart } from 'lucide-react'

// No fabricated performance stats. BSE tracks results transparently once the
// model goes live, so these are honest, clearly-labeled placeholders.
const stats = [
  { value: '—', label: 'Units — tracking Week 1' },
  { value: '—', label: 'Win Rate — tracking Week 1' },
  { value: '—', label: 'Avg Edge — tracking Week 1' },
  { value: '—', label: 'Record — tracking Week 1' },
]

const socials = [
  { icon: AtSign, label: 'X / Twitter' },
  { icon: Camera, label: 'Instagram' },
  { icon: Play, label: 'YouTube' },
  { icon: Music2, label: 'TikTok' },
]

export function ResultsBand() {
  return (
    <section className="border-b border-border/60 bg-background py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          {/* Heading */}
          <div>
            <h2 className="font-display text-4xl font-bold uppercase leading-[0.95] tracking-tight sm:text-5xl">
              <span className="block text-foreground">Real Data.</span>
              <span className="block text-foreground">Real Edges.</span>
              <span className="block text-primary text-glow">Tracked Honestly.</span>
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
              BSE grades every number on data, probability, and expected value —
              not hype. Performance tracking begins Week 1 and every result is
              timestamped so the record can&apos;t be changed after the fact.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="font-display text-3xl font-bold text-primary sm:text-4xl">
                  {s.value}
                </div>
                <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonial + community */}
        <div className="mt-10 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <figure className="rounded-xl border border-border bg-card p-6">
            <blockquote className="text-pretty text-base text-foreground">
              &ldquo;BSE has completely changed the way I handicap games. The
              edges are real.&rdquo;
            </blockquote>
            <div className="mt-4 flex items-center justify-between">
              <figcaption className="font-display text-sm font-bold uppercase tracking-wide text-primary">
                — BSE Pro Member
              </figcaption>
              <div className="flex gap-0.5" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                ))}
              </div>
            </div>
          </figure>

          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6">
            <Image
              src="/images/bse-badge.png"
              alt="Big Spread Energy community badge"
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 rounded-full"
            />
            <div>
              <div className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                Join The BSE Community
              </div>
              <div className="mt-3 flex gap-2">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href="#"
                    aria-label={s.label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <s.icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
