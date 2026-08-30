import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAdmin } from "@/lib/admin-auth"
import { getFrozenCandidate, getOverallStats, getWeeklyStats, listSignals } from "@/lib/shadow/service"
import { ShadowValidation } from "@/components/admin/shadow-validation"

// Hidden route: not linked in nav and kept out of search indexes.
export const metadata: Metadata = {
  title: "Shadow Validation — Big Spread Energy",
  robots: { index: false, follow: false },
}

// Never cache an authorization-gated page.
export const dynamic = "force-dynamic"

export default async function ShadowValidationPage() {
  // SERVER-SIDE authorization, identical gate to the main admin page.
  const admin = await getAdmin()
  if (!admin.ok) notFound()

  const candidate = await getFrozenCandidate()

  // No candidate frozen yet -> render the empty state with no stats queries.
  if (!candidate) {
    return <ShadowValidation candidate={null} overall={null} weekly={[]} signals={[]} />
  }

  const [overall, weekly, signals] = await Promise.all([
    getOverallStats(candidate.modelHash),
    getWeeklyStats(candidate.modelHash),
    listSignals(candidate.modelHash, 200),
  ])

  return <ShadowValidation candidate={candidate} overall={overall} weekly={weekly} signals={signals} />
}
