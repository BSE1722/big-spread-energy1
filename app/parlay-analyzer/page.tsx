import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { ParlayAnalyzer } from "@/components/parlay/parlay-analyzer"

export const metadata: Metadata = {
  title: "Parlay Analyzer — Grade Any Parlay | Big Spread Energy",
  description:
    "Build a parlay and grade every spread leg two ways — line value in points against the BSE fair spread, and the DraftKings price — before you place it.",
}

export default function ParlayAnalyzerPage() {
  return (
    <main>
      <PageHeader
        eyebrow="BSE Analyzer"
        title="Parlay Analyzer"
        description="BSE grades every spread leg two ways — how the number compares to its fair line in points, and whether the DraftKings price is worth paying — then reads the whole ticket honestly. No win probability or EV is claimed."
      />
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <ParlayAnalyzer />
      </section>
    </main>
  )
}
