import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { BoardView } from "@/components/board/board-view"
import { RatingsTable } from "@/components/board/ratings-table"
import { TeamSearch } from "@/components/board/team-search"
import { DemoDataBanner } from "@/components/demo-data-banner"
import { CURRENT_CONTEXT } from "@/lib/bse"

export const metadata: Metadata = {
  title: "The Board — Live Lines & BSE Fair Lines | Big Spread Energy",
  description:
    "Live college football game lines against BSE projected fair lines, edge scores, and BSE ratings.",
}

export default function BoardPage() {
  return (
    <main>
      <PageHeader
        eyebrow={`${CURRENT_CONTEXT.league.toUpperCase()} · Week ${CURRENT_CONTEXT.week} · ${CURRENT_CONTEXT.season}`}
        title="The Board"
        description="Every game, every number. Market lines stacked against the BSE Projection fair line, with the Edge and a 0–100 BSE Rating — built to compare multiple sportsbooks and surface the best available price."
      />

      <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        <DemoDataBanner />
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <TeamSearch />
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <BoardView />
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <RatingsTable />
      </section>
    </main>
  )
}
