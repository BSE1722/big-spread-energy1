import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { ParlayGenerator } from "@/components/parlay/parlay-generator"

export const metadata: Metadata = {
  title: "Getting Parlaid — BSE Parlay Generator | Big Spread Energy",
  description:
    "Let BSE build a data-backed parlay for you. Pick a risk profile and get an optimized ticket with combined odds and BSE confidence.",
}

export default function GettingParlaidPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Tools"
        title="Getting Parlaid"
        description="BSE searches combinations to optimize the whole ticket on joint probability, expected value, confidence, correlation, and payout — and will recommend fewer legs, or none, rather than force a bad ticket."
      />
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <ParlayGenerator />
      </section>
    </main>
  )
}
