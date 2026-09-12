/**
 * ============================================================================
 * BSE ACCESS CONTROL  —  SINGLE SOURCE OF TRUTH FOR TIER + WEEKLY UNLOCK
 * ============================================================================
 * Server-only. Resolves, for the current request:
 *   - who the user is (Better Auth session)
 *   - their tier: "guest" | "rookie" | "pro"
 *   - whether a Rookie has spent this week's free breakdown, and on which game
 *
 * The weekly period is keyed by the site's existing (season, week) from
 * lib/bse/season.ts. Because weeks advance in 7-day buckets from a Monday
 * anchor, the "resets Monday" behavior falls out of the same helper the rest
 * of the site already uses — there is no separate reset clock or cron.
 *
 * There is NO Row Level Security on Neon, so every query here is explicitly
 * scoped by userId.
 * ============================================================================
 */

import "server-only"
import { headers } from "next/headers"
import { and, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { weeklyUnlocks, subscriptions, user as userTable } from "@/lib/db/schema"
import { getCurrentContext, type SeasonContext } from "@/lib/bse/season"

export type AccessTier = "guest" | "rookie" | "pro"

export interface WeeklyUnlockInfo {
  gameId: string
  matchup: string | null
  unlockedAt: string
}

export interface AccessState {
  tier: AccessTier
  userId: string | null
  userName: string | null
  userEmail: string | null
  season: number
  week: number
  /** The unlock a Rookie has spent this week, if any. Always null for guest/pro. */
  weeklyUnlock: WeeklyUnlockInfo | null
  /** True only for a Rookie who has NOT yet spent this week's breakdown. */
  canUnlockThisWeek: boolean
}

/** The Better Auth session user, or null. Server-only. */
export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

/**
 * Is this user currently BSE Pro? Scoped by userId.
 *
 * Owners/admins ALWAYS have full Pro access — every Pro-gated surface resolves
 * Pro through this one function (directly, or via getAccessState → tier), so
 * short-circuiting here grants an admin unlimited access to all current and
 * future Pro features without any Stripe subscription or subscriptions row.
 * The role is read fresh from the DB every check, so revoking admin takes
 * effect immediately. Normal free/paid users are unaffected.
 *
 * Otherwise: an active/trialing subscription = Pro.
 */
export async function isProUser(userId: string): Promise<boolean> {
  const adminRows = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)
  if (adminRows[0]?.role === "admin") return true

  const rows = await db
    .select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1)
  const sub = rows[0]
  if (!sub) return false
  if (sub.status !== "active" && sub.status !== "trialing") return false
  // If we know the period end, honor it; otherwise trust the status.
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < Date.now()) return false
  return true
}

/** The Rookie's unlock for the given (season, week), if any. Scoped by userId. */
export async function getWeeklyUnlock(
  userId: string,
  ctx: SeasonContext,
): Promise<WeeklyUnlockInfo | null> {
  const rows = await db
    .select()
    .from(weeklyUnlocks)
    .where(
      and(
        eq(weeklyUnlocks.userId, userId),
        eq(weeklyUnlocks.season, ctx.season),
        eq(weeklyUnlocks.week, ctx.week),
      ),
    )
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return { gameId: row.gameId, matchup: row.matchup, unlockedAt: row.unlockedAt.toISOString() }
}

/**
 * Resolve the full access state for the current request. This is the function
 * every gated surface (Board, breakdown page, APIs) calls.
 */
export async function getAccessState(): Promise<AccessState> {
  const ctx = getCurrentContext()
  const user = await getSessionUser()

  if (!user) {
    return {
      tier: "guest",
      userId: null,
      userName: null,
      userEmail: null,
      season: ctx.season,
      week: ctx.week,
      weeklyUnlock: null,
      canUnlockThisWeek: false,
    }
  }

  const pro = await isProUser(user.id)
  if (pro) {
    return {
      tier: "pro",
      userId: user.id,
      userName: user.name ?? null,
      userEmail: user.email ?? null,
      season: ctx.season,
      week: ctx.week,
      weeklyUnlock: null,
      canUnlockThisWeek: false,
    }
  }

  const weeklyUnlock = await getWeeklyUnlock(user.id, ctx)
  return {
    tier: "rookie",
    userId: user.id,
    userName: user.name ?? null,
    userEmail: user.email ?? null,
    season: ctx.season,
    week: ctx.week,
    weeklyUnlock,
    canUnlockThisWeek: weeklyUnlock === null,
  }
}

/**
 * Whether the given user may view the FULL breakdown for a specific game right
 * now. Pro → always. Rookie → only the one game they unlocked this week.
 * Guest → never. This is the authorization check used by the breakdown API.
 */
export function canViewBreakdown(state: AccessState, gameId: string): boolean {
  if (state.tier === "pro") return true
  if (state.tier === "rookie") return state.weeklyUnlock?.gameId === gameId
  return false
}
