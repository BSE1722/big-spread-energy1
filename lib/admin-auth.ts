import "server-only"

import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * Server-side admin authorization. This is the ONLY source of truth for admin
 * access — pages AND API routes both call it. Knowing the /admin URL grants
 * nothing; the role is read fresh from the database on every check.
 *
 * We intentionally re-read the role from the DB (not from the session token)
 * so that revoking admin takes effect immediately, even on an existing session.
 */
export type AdminCheck =
  | { ok: true; userId: string; email: string; name: string }
  | { ok: false; reason: "unauthenticated" | "forbidden" }

export async function getAdmin(): Promise<AdminCheck> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return { ok: false, reason: "unauthenticated" }

  const rows = await db
    .select({ role: userTable.role, email: userTable.email, name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1)

  const row = rows[0]
  if (!row || row.role !== "admin") return { ok: false, reason: "forbidden" }

  return { ok: true, userId: session.user.id, email: row.email, name: row.name }
}

/** True only for an authenticated user whose DB role is 'admin'. */
export async function isAdmin(): Promise<boolean> {
  return (await getAdmin()).ok
}
