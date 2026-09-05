import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { toolUsage } from "@/lib/db/schema"
import { getToolLimits } from "@/lib/config/service"
import type { ToolName, ToolUsageInfo, WeeklyToolUsage, LastToolPayload } from "@/lib/tools/types"

export type { ToolName, ToolUsageInfo, WeeklyToolUsage, LastToolPayload } from "@/lib/tools/types"

/**
 * Deterministic request signature. Includes the (season, week, seasonType) so
 * an identical ticket in a different week is counted separately, and the
 * normalized tool inputs so re-running / refreshing the SAME ticket collapses
 * to one row (idempotent via the UNIQUE (userId, tool, requestHash) index).
 */
export function toolRequestHash(args: {
  userId: string
  tool: ToolName
  season: number
  week: number
  seasonType: string
  signature: string
}): string {
  return createHash("sha256")
    .update([args.userId, args.tool, args.season, args.week, args.seasonType, args.signature].join("|"))
    .digest("hex")
}

/** Count completed runs for one tool this week, scoped by userId. */
async function countUses(
  userId: string,
  tool: ToolName,
  season: number,
  week: number,
  seasonType: string,
): Promise<number> {
  const rows = await db
    .select({ id: toolUsage.id })
    .from(toolUsage)
    .where(
      and(
        eq(toolUsage.userId, userId),
        eq(toolUsage.tool, tool),
        eq(toolUsage.season, season),
        eq(toolUsage.week, week),
        eq(toolUsage.seasonType, seasonType),
      ),
    )
  return rows.length
}

/**
 * Per-tool usage for the current week. `isPro` callers are unlimited. Weekly
 * reset is implicit: a new (season, week) simply has no rows. Never deletes.
 */
export async function getToolUsage(
  userId: string,
  season: number,
  week: number,
  seasonType: string,
  isPro: boolean,
): Promise<WeeklyToolUsage> {
  const limits = await getToolLimits()
  const [analyzerUsed, parlaidUsed] = await Promise.all([
    countUses(userId, "analyzer", season, week, seasonType),
    countUses(userId, "parlaid", season, week, seasonType),
  ])

  const build = (tool: ToolName, used: number, limit: number): ToolUsageInfo => ({
    tool,
    used,
    limit,
    // Pro is uncapped; expose `limit` as `remaining` (never Infinity, which the
    // JSON usage route would coerce to null) and let the UI read `unlimited`.
    remaining: isPro ? limit : Math.max(0, limit - used),
    unlimited: isPro,
  })

  return {
    season,
    week,
    seasonType,
    analyzer: build("analyzer", analyzerUsed, limits.analyzerFreeWeekly),
    parlaid: build("parlaid", parlaidUsed, limits.parlaidFreeWeekly),
  }
}

/**
 * Record ONE completed, successful tool run. Idempotent: a repeat requestHash
 * (same ticket, refresh, re-press) hits the UNIQUE constraint and inserts
 * nothing. Returns whether a NEW allowance was consumed.
 */
export async function recordUse(args: {
  userId: string
  tool: ToolName
  season: number
  week: number
  seasonType: string
  requestHash: string
  payload?: unknown
  ticketId?: string | null
}): Promise<{ consumed: boolean }> {
  const inserted = await db
    .insert(toolUsage)
    .values({
      id: randomUUID(),
      userId: args.userId,
      tool: args.tool,
      season: args.season,
      week: args.week,
      seasonType: args.seasonType,
      requestHash: args.requestHash,
      payload: (args.payload ?? null) as object | null,
      ticketId: args.ticketId ?? null,
    })
    .onConflictDoNothing({ target: [toolUsage.userId, toolUsage.tool, toolUsage.requestHash] })
    .returning({ id: toolUsage.id })
  return { consumed: inserted.length > 0 }
}

/**
 * Look up an existing completed run by its request hash (idempotent replay).
 * Lets a re-press / refresh of the SAME ticket return the already-persisted
 * result instead of creating a duplicate snapshot or consuming a new allowance.
 * Scoped by userId.
 */
export async function findUseByHash(
  userId: string,
  tool: ToolName,
  requestHash: string,
): Promise<{ payload: unknown; ticketId: string | null } | null> {
  const rows = await db
    .select({ payload: toolUsage.payload, ticketId: toolUsage.ticketId })
    .from(toolUsage)
    .where(and(eq(toolUsage.userId, userId), eq(toolUsage.tool, tool), eq(toolUsage.requestHash, requestHash)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return { payload: row.payload ?? null, ticketId: row.ticketId }
}

/**
 * The most recent completed run for this user+tool (any week), used to re-show
 * an at-limit user their last ticket read-only. Scoped by userId.
 */
export async function getLastPayload(userId: string, tool: ToolName): Promise<LastToolPayload | null> {
  const rows = await db
    .select({
      payload: toolUsage.payload,
      ticketId: toolUsage.ticketId,
      createdAt: toolUsage.createdAt,
      season: toolUsage.season,
      week: toolUsage.week,
    })
    .from(toolUsage)
    .where(and(eq(toolUsage.userId, userId), eq(toolUsage.tool, tool)))
    .orderBy(desc(toolUsage.createdAt))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    payload: row.payload ?? null,
    ticketId: row.ticketId,
    createdAt: row.createdAt.toISOString(),
    season: row.season,
    week: row.week,
  }
}
