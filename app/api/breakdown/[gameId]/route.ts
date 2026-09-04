import { NextResponse, type NextRequest } from "next/server"
import { getAccessState, canViewBreakdown } from "@/lib/access"
import { assembleBreakdown } from "@/lib/breakdown/assemble"

/**
 * Full BSE breakdown for a single game — SERVER-GATED.
 *
 * The premium payload is only assembled and returned when `canViewBreakdown`
 * passes for the current viewer:
 *   - Pro           → any game
 *   - Rookie        → only the one game they unlocked this week
 *   - Guest/others  → 403-style `locked` flag so the client shows the correct
 *                     upgrade/sign-up state. No premium values leak.
 *
 * All assembly (base model read, context adjustments, market intel, weather
 * impact, alt lab, freshness) lives in `assembleBreakdown` so this route and
 * the server-rendered page share one honest, auditable source of truth.
 *
 * Data honesty is enforced in the assembler: market + line movement are real
 * snapshot values; the base spread comes from the FROZEN model; weather impact
 * is computed from real stored forecasts; injuries/news are reported as
 * DATA UNAVAILABLE rather than fabricated or silently assumed neutral.
 */
export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  const access = await getAccessState()

  const assembled = await assembleBreakdown(gameId)
  if (!assembled.found || !assembled.header) {
    return NextResponse.json({ ok: false, error: "Game not found." }, { status: 404 })
  }

  // Header info every viewer is allowed to see (matchup, kickoff, market line,
  // and the public BSE rating that already appears on the Board).
  const header = assembled.header

  if (!canViewBreakdown(access, gameId)) {
    return NextResponse.json(
      {
        ok: true,
        locked: true,
        tier: access.tier,
        canUnlockThisWeek: access.canUnlockThisWeek,
        weeklyUnlock: access.weeklyUnlock,
        header,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      locked: false,
      tier: access.tier,
      viaWeeklyUnlock: access.tier === "rookie",
      header,
      analysis: assembled.analysis,
      snapshotAt: assembled.snapshotAt,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
