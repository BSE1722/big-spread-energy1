"use client"

import { useCallback, useEffect, useState } from "react"
import type { AccessTier } from "@/lib/access"
import type { WeeklyToolUsage, LastToolPayload } from "@/lib/tools/types"

export interface ToolUsageResponse {
  tier: AccessTier
  season: number
  week: number
  seasonType: string
  usage: WeeklyToolUsage | null
  lastAnalyzer: LastToolPayload | null
  lastParlaid: LastToolPayload | null
}

export interface ToolUsageState {
  data: ToolUsageResponse | null
  loading: boolean
  error: string | null
  /** Re-pull after a completed run so the meter reflects the new count. */
  refresh: () => Promise<void>
  /** Optimistically replace usage (e.g. from a server action's return). */
  setUsage: (usage: WeeklyToolUsage) => void
}

/**
 * Client view of the current viewer's tool usage, backed by /api/tool-usage
 * (server is always the source of truth). Mirrors the plain-fetch pattern of
 * useAccess/useLiveBoard — no SWR dependency.
 */
export function useToolUsage(): ToolUsageState {
  const [data, setData] = useState<ToolUsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tool-usage", { credentials: "include" })
      if (!res.ok) throw new Error(`Usage request failed (${res.status})`)
      const json: ToolUsageResponse = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await load()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const setUsage = useCallback((usage: WeeklyToolUsage) => {
    setData((prev) => (prev ? { ...prev, usage } : prev))
  }, [])

  return { data, loading, error, refresh: load, setUsage }
}
