import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { gradePending } from "@/lib/predictions/service"

/**
 * AUTOMATIC scheduled grading (Vercel Cron).
 *
 * Runs the grading engine with trigger="cron", which enforces the conservative
 * STALE_CUTOFF so a postponed/stuck game can never trigger CFBD calls forever.
 * Like the manual path it is Neon-first: if no pick is eligible it exits with
 * ZERO CFBD requests, and it makes at most one CFBD call per week group.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. We verify it in
 * constant time and fail closed when CRON_SECRET is unset.
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
    const result = await gradePending("cron")
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[v0] cron grade-finals failed:", error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Grading failed" },
      { status: 500 },
    )
  }
}

// Vercel Cron issues GET requests.
export async function GET(request: NextRequest) {
  return run(request)
}
