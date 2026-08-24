import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { isAdmin } from "@/lib/admin-auth"
import { gradePending, listGradingRuns } from "@/lib/predictions/service"

/**
 * ADMIN-ONLY manual "Grade Finals" trigger.
 *
 * POST runs the grading engine with trigger="manual". Manual runs intentionally
 * IGNORE the stale cutoff (so an admin can resolve a genuinely-final-but-old
 * pick), but obey every other API-conservation rule: Neon-first, zero-call exit
 * when nothing is eligible, one CFBD call per (season,week,seasonType) group,
 * already-graded picks excluded, idempotent.
 *
 * GET returns the most recent grading-run log rows (internal usage visibility).
 *
 * Authorized if EITHER a valid ADMIN_REFRESH_SECRET is presented (scripts) OR
 * the caller is a signed-in admin (dashboard UI). The secret is never returned.
 */

export const dynamic = "force-dynamic"

function presentedSecret(request: NextRequest): string {
  const header = request.headers.get("x-admin-secret")
  if (header) return header
  const auth = request.headers.get("authorization") ?? ""
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : ""
}

function hasValidSecret(request: NextRequest): boolean {
  const expected = process.env.ADMIN_REFRESH_SECRET
  if (!expected) return false
  const presented = presentedSecret(request)
  if (!presented) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  if (hasValidSecret(request)) return true
  return await isAdmin()
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await gradePending("manual")
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[v0] manual grade-finals failed:", error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Grading failed" },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  const runs = await listGradingRuns(10)
  return NextResponse.json({ ok: true, runs })
}
