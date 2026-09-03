import { redirect } from "next/navigation"

/**
 * The Parlay Analyzer now lives as the "Analyze" sub-tab of Getting Parlaid.
 * Preserve legacy/deep links (including ?game=&side= preselection) by
 * redirecting them to the merged route with the analyzer tab active.
 */
export default async function ParlayAnalyzerRedirect({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; side?: string }>
}) {
  const { game, side } = await searchParams
  const params = new URLSearchParams({ tab: "analyze" })
  if (game) params.set("game", game)
  if (side) params.set("side", side)
  redirect(`/getting-parlaid?${params.toString()}`)
}
