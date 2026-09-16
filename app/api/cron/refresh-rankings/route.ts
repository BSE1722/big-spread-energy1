import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { refreshApPoll } from "@/lib/rankings/service"

/**
 * AUTOMATIC weekly AP Top 25 refresh (Vercel Cron).
 *
 * Fetches the current AP poll from ESPN's public endpoint and stores it in
 * `app_config`. The AP poll is released Sunday afternoons ET during the season,
 * so this runs Sunday evening + Monday midday (UTC) to catch it and any Monday
 * corrections. ESPN's endpoint is free and unmetered, so cadence is not a cost
 * concern.
 *
 * Ranks are cosmetic — this never touches a BSE Rating, fair line, edge, or the
 * odds snapshot.
 *
 * SECURITY: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. We verify it
 * in constant time and fail closed when CRON_SECRET is unset.
 */

export const dynamic = "force-dynamic"

function isAuthorizedCron(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false // fail closed
  const auth = request.headers.get("authorization") ?? ""
  const presented = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : ""
  if (!presented) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function run(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  try {
    const stored = await refreshApPoll()
    return NextResponse.json({
      ok: true,
      season: stored.season,
      week: stored.week,
      updatedAt: stored.updatedAt,
      teams: stored.poll.length,
    })
  } catch (error) {
    console.error("[v0] cron refresh-rankings failed:", error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Rankings refresh failed" },
      { status: 500 },
    )
  }
}

// Vercel Cron issues GET requests.
export async function GET(request: NextRequest) {
  return run(request)
}
