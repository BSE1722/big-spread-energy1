import { NextResponse } from "next/server"
import { getLiveBoard } from "@/lib/board-feed"

/**
 * Live board feed for The Board + homepage Top Edges.
 *
 * SOURCE OF TRUTH SPLIT:
 *   - CFBD  → schedule, teams, kickoff times, IDs, game identity (fetched live).
 *   - SGO/DraftKings → betting markets ONLY, read from the FROZEN manual
 *     snapshot. This route NEVER calls SportsGameOdds; visitors can't move the
 *     lines. Odds change only when an admin triggers a refresh.
 *
 * All assembly lives in `lib/board-feed.ts` (getLiveBoard) so this customer
 * route and the gated tool server actions grade against the identical slate.
 */

// Cache is driven by the snapshot, not by time. Keep the schedule fresh but do
// not let this route perform any background odds revalidation.
export const dynamic = "force-dynamic"

export async function GET() {
  const feed = await getLiveBoard()
  if (!feed.ok) {
    return NextResponse.json(
      { ok: false, retryable: feed.retryable ?? false, error: feed.error },
      { status: feed.status },
    )
  }
  return NextResponse.json(feed)
}
