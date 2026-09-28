import { NextResponse } from "next/server"
import { getStoredApPoll } from "@/lib/rankings/service"
import { enrichApPoll, getApTop25 } from "@/lib/bse"

/**
 * Public read of the current AP Top 25, enriched with team name + brand color.
 * Returns the DB-stored poll (kept fresh weekly by the refresh-rankings cron)
 * and falls back to the hard-coded seed when it has not been ingested yet, so
 * this endpoint always returns a usable poll. The client RankingsProvider polls
 * this — never ESPN directly.
 */

export const dynamic = "force-dynamic"

export async function GET() {
  const stored = await getStoredApPoll()
  if (stored) {
    return NextResponse.json({
      ok: true,
      source: "db",
      season: stored.season,
      week: stored.week,
      updatedAt: stored.updatedAt,
      poll: enrichApPoll(stored.poll),
    })
  }
  return NextResponse.json({
    ok: true,
    source: "seed",
    season: null,
    week: null,
    updatedAt: null,
    poll: getApTop25(),
  })
}
