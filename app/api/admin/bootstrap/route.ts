import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * One-time admin bootstrap. Promotes an existing user (by email) to the 'admin'
 * role so they can reach the /admin dashboard.
 *
 * SECURITY:
 *  - Requires ADMIN_BOOTSTRAP_SECRET (compared in constant time). Fails closed
 *    if the secret is not configured.
 *  - Only promotes users that already exist (create the account normally first).
 *  - Intended to be called once to seed the first admin, then you can remove
 *    the env var. Additional admins can be promoted the same way.
 *
 * Usage:
 *   curl -X POST /api/admin/bootstrap \
 *     -H "x-admin-secret: <ADMIN_BOOTSTRAP_SECRET>" \
 *     -H "content-type: application/json" \
 *     -d '{"email":"you@example.com"}'
 */
export const dynamic = "force-dynamic"

function authorized(request: NextRequest): boolean {
  const expected = process.env.ADMIN_BOOTSTRAP_SECRET
  if (!expected) return false
  const presented = request.headers.get("x-admin-secret") ?? ""
  if (!presented) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  let email = ""
  try {
    const body = (await request.json()) as { email?: string }
    email = (body.email ?? "").trim().toLowerCase()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }
  if (!email) {
    return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 })
  }

  const rows = await db
    .update(userTable)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(userTable.email, email))
    .returning({ id: userTable.id, email: userTable.email, role: userTable.role })

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No user with that email. Create the account first, then bootstrap." },
      { status: 404 },
    )
  }

  return NextResponse.json({ ok: true, promoted: rows[0] })
}
