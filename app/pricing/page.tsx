import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { PricingPlans } from "@/components/pricing/pricing-plans"

export const metadata: Metadata = {
  title: "BSE Pro Pricing | Big Spread Energy",
  description:
    "Upgrade to BSE Pro for full fair lines, edge scores, the Getting Parlaid generator, and real-time line alerts.",
}

const faqs = [
  {
    q: "How are BSE fair lines calculated?",
    a: "Our model blends team power ratings, matchup-specific adjustments, pace, and situational factors to project a true spread and total for every game, independent of the sportsbook number.",
  },
  {
    q: "What is an edge score?",
    a: "The edge score is the number of points of value between the market line and the BSE fair line. Bigger gaps mean bigger theoretical edges.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. BSE Pro is month-to-month or annual, and you can cancel from your account settings at any time — no questions asked.",
  },
  {
    q: "Is this legal?",
    a: "BSE provides analytics and information only. We never take bets. You must be 21+ and follow the laws in your jurisdiction.",
  },
]

export default function PricingPage() {
  return (
    <main>
      <PageHeader
        eyebrow="BSE Pro"
        title="Pick your edge"
        description="Start free, upgrade when you're ready to attack every number. Cancel anytime."
      />

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <PricingPlans />
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <h2 className="text-center font-display text-3xl font-bold uppercase tracking-tight">
          Frequently asked
        </h2>
        <dl className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
          {faqs.map((f) => (
            <div key={f.q} className="p-6">
              <dt className="font-display text-lg font-semibold text-foreground">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  )
}
