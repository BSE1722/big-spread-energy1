import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { appConfig } from "@/lib/db/schema"

/**
 * Editable app configuration. Today this holds the free-tier tool limits so an
 * admin can tune them live (no redeploy). Readers ALWAYS fall back to the
 * hard-coded defaults below, so the app is fully functional even if the
 * `app_config` row is missing or malformed.
 */

export interface ToolLimits {
  /** Free (Rookie) analyzer runs allowed per week. */
  analyzerFreeWeekly: number
  /** Free (Rookie) Getting Parlaid generations allowed per week. */
  parlaidFreeWeekly: number
}

export const DEFAULT_TOOL_LIMITS: ToolLimits = {
  analyzerFreeWeekly: 3,
  parlaidFreeWeekly: 1,
}

const TOOL_LIMITS_KEY = "tool_limits"

/** Coerce an arbitrary stored value into a safe, non-negative integer limit. */
function coerceLimit(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

export async function getToolLimits(): Promise<ToolLimits> {
  try {
    const rows = await db.select({ value: appConfig.value }).from(appConfig).where(eq(appConfig.key, TOOL_LIMITS_KEY)).limit(1)
    const raw = rows[0]?.value as Partial<Record<keyof ToolLimits, unknown>> | undefined
    if (!raw || typeof raw !== "object") return { ...DEFAULT_TOOL_LIMITS }
    return {
      analyzerFreeWeekly: coerceLimit(raw.analyzerFreeWeekly, DEFAULT_TOOL_LIMITS.analyzerFreeWeekly),
      parlaidFreeWeekly: coerceLimit(raw.parlaidFreeWeekly, DEFAULT_TOOL_LIMITS.parlaidFreeWeekly),
    }
  } catch (err) {
    console.error("[v0] getToolLimits failed; using defaults:", err)
    return { ...DEFAULT_TOOL_LIMITS }
  }
}

/**
 * Persist new tool limits. Caller MUST have verified admin status first — this
 * function does not re-check authorization (the server action owns that).
 * Values are clamped to safe non-negative integers before write.
 */
export async function setToolLimits(next: Partial<ToolLimits>, updatedBy: string | null): Promise<ToolLimits> {
  const current = await getToolLimits()
  const merged: ToolLimits = {
    analyzerFreeWeekly: coerceLimit(next.analyzerFreeWeekly ?? current.analyzerFreeWeekly, current.analyzerFreeWeekly),
    parlaidFreeWeekly: coerceLimit(next.parlaidFreeWeekly ?? current.parlaidFreeWeekly, current.parlaidFreeWeekly),
  }
  await db
    .insert(appConfig)
    .values({ key: TOOL_LIMITS_KEY, value: merged, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: merged, updatedBy, updatedAt: new Date() },
    })
  return merged
}
