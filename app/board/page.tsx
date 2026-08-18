import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { BoardView } from "@/components/board/board-view"
import { RatingsTable } from "@/components/board/ratings-table"

export const metadata: Metadata = {
  title: "The Board — Live Lines & BSE Fair Lines | Big Spread Energy",
  description:
    "Live college football game lines against BSE projected fair lines, edge scores, and BSE ratings.",
}

export default function BoardPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Week 11 · Live"
        title="The Board"
        description="Every game, every number. Market lines stacked against BSE projected fair lines, with edge scores and conviction ratings updated in real time."
      />

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <BoardView />
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <RatingsTable />
      </section>
    </main>
  )
}
