import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { ParlayAnalyzer } from "@/components/parlay/parlay-analyzer"
import { DemoDataBanner } from "@/components/demo-data-banner"

export const metadata: Metadata = {
  title: "Parlay Analyzer — Grade Any Parlay | Big Spread Energy",
  description:
    "Build a parlay and get its combined odds, BSE fair price, win probability, and expected value before you place it.",
}

export default function ParlayAnalyzerPage() {
  return (
    <main>
      <PageHeader
        eyebrow="BSE Analyzer"
        title="Parlay Analyzer"
        description="Build or paste a parlay and BSE grades the whole ticket — every leg gets its own probability, edge, EV, and a KEEP / REMOVE / REPLACE call, then we analyze correlation and joint probability across the ticket."
      />
      <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        <DemoDataBanner />
      </section>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <ParlayAnalyzer />
      </section>
    </main>
  )
}
