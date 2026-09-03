import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { ParlayTools } from "@/components/parlay/parlay-tools"

export const metadata: Metadata = {
  title: "Getting Parlaid — Build & Grade Parlays | Big Spread Energy",
  description:
    "Two ways to attack a parlay in one place: let BSE generate a ticket whose legs each clear its spread-edge threshold, or build your own and grade every leg against the BSE fair line and DraftKings price.",
}

export default function GettingParlaidPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Tools"
        title="Getting Parlaid"
        description="Two ways to attack a parlay in one place. Let BSE generate a ticket whose legs each clear its spread-edge threshold, or switch to Analyze to build your own and grade every leg against the fair line and the DraftKings price."
      />
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Suspense fallback={null}>
          <ParlayTools />
        </Suspense>
      </section>
    </main>
  )
}
