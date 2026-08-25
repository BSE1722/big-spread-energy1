import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { PerformanceView } from "@/components/performance/performance-view"
import { getCurrentContext } from "@/lib/bse/season"
import { listPredictions, listCorrections, summarize } from "@/lib/predictions/service"
import { toPredictionView } from "@/lib/predictions/view"

export const metadata: Metadata = {
  title: "Track Record | Big Spread Energy",
  description:
    "The complete, permanent record of every Official BSE Pick — wins, losses, and pushes. Each pick is frozen at publication before kickoff and graded from final scores. Nothing is ever deleted.",
}

// Always reflect the latest grading/publishing; this page reads the DB directly.
export const dynamic = "force-dynamic"

export default async function PerformancePage() {
  const ctx = getCurrentContext()
  const predictions = await listPredictions()
  const corrections = await listCorrections(predictions.map((p) => p.id))
  const summary = summarize(predictions)
  const views = predictions.map((p) => toPredictionView(p, corrections))

  return (
    <main>
      <PageHeader
        eyebrow="Verified Track Record"
        title="Every pick. On the record."
        description="Official BSE Picks are frozen the moment they're published — before kickoff — then graded straight from final scores. Wins, losses, and pushes all stay up permanently. No deleting, no rewriting."
      />

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
        <PerformanceView
          predictions={views}
          summary={summary}
          currentSeason={ctx.season}
          currentWeek={ctx.week}
        />
      </section>
    </main>
  )
}
