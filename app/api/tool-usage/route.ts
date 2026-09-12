import { NextResponse } from "next/server"
import { getAccessState } from "@/lib/access"
import { getCurrentContext } from "@/lib/bse/season"
import { getToolUsage, getLastPayload } from "@/lib/usage/service"
import type { WeeklyToolUsage, LastToolPayload } from "@/lib/tools/types"

/**
 * Current viewer's per-tool usage + limits for the active week (server source
 * of truth) plus the last saved payload for each tool so an at-limit user can
 * be re-shown their most recent ticket read-only. Never cached across users.
 */
export async function GET() {
  const access = await getAccessState()
  const ctx = getCurrentContext()

  let usage: WeeklyToolUsage | null = null
  let lastAnalyzer: LastToolPayload | null = null
  let lastParlaid: LastToolPayload | null = null

  if (access.userId) {
    const isPro = access.tier === "pro"
    ;[usage, lastAnalyzer, lastParlaid] = await Promise.all([
      getToolUsage(access.userId, ctx.season, ctx.week, ctx.seasonType, isPro),
      getLastPayload(access.userId, "analyzer"),
      getLastPayload(access.userId, "parlaid"),
    ])
  }

  return NextResponse.json(
    { tier: access.tier, season: ctx.season, week: ctx.week, seasonType: ctx.seasonType, usage, lastAnalyzer, lastParlaid },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
