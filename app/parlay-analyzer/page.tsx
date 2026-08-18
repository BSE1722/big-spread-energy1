import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { ParlayAnalyzer } from "@/components/parlay/parlay-analyzer"

export const metadata: Metadata = {
  title: "Parlay Analyzer — Grade Any Parlay | Big Spread Energy",
  description:
    "Build a parlay and get its combined odds, BSE fair price, win probability, and expected value before you place it.",
}

export default function ParlayAnalyzerPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Tools"
        title="Parlay Analyzer"
        description="Stack your legs and let BSE grade the ticket. We compute the true fair price against the market so you know whether you're pressing an edge or paying the vig."
      />
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <ParlayAnalyzer />
      </section>
    </main>
  )
}
