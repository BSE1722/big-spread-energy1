import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { ParlayGenerator } from "@/components/parlay/parlay-generator"

export const metadata: Metadata = {
  title: "Getting Parlaid — BSE Parlay Generator | Big Spread Energy",
  description:
    "Let BSE build a parlay from its per-game spread reads. Pick a risk profile and get a ticket whose legs each clear BSE's spread-edge threshold.",
}

export default function GettingParlaidPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Tools"
        title="Getting Parlaid"
        description="BSE searches combinations to build a ticket whose legs each clear its spread-edge threshold while avoiding stacked shared risk — and will recommend fewer legs, or none, rather than force a bad ticket."
      />
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <ParlayGenerator />
      </section>
    </main>
  )
}
