import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { ParlayAnalyzer } from "@/components/parlay/parlay-analyzer"

export const metadata: Metadata = {
  title: "Parlay Analyzer — Grade Any Parlay | Big Spread Energy",
  description:
    "Build a parlay and grade every spread leg against the BSE model's fair spread — a per-leg edge in points and a lean — before you place it.",
}

export default function ParlayAnalyzerPage() {
  return (
    <main>
      <PageHeader
        eyebrow="BSE Analyzer"
        title="Parlay Analyzer"
        description="BSE grades every spread leg — each gets a fair spread, an edge in points, and a lean — then totals the edge across the ticket and flags legs that share risk."
      />
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <ParlayAnalyzer />
      </section>
    </main>
  )
}
