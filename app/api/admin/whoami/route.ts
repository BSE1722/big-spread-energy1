import { NextResponse } from "next/server"
import { isAdmin } from "@/lib/admin-auth"

/**
 * Lightweight admin probe for public client components that want to reveal an
 * admin-only control (e.g. "Save for grading" on the analyzer). This ONLY
 * reports a boolean — it grants nothing. The underlying server action re-checks
 * admin status via getAdmin() before doing any write, so a spoofed `true` here
 * can never record or grade anything.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ admin: await isAdmin() })
}
