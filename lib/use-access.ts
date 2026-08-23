"use client"

import { useCallback, useEffect, useState } from "react"
import type { AccessTier, WeeklyUnlockInfo } from "@/lib/access"

export interface AccessResponse {
  tier: AccessTier
  userId: string | null
  userName: string | null
  userEmail: string | null
  season: number
  week: number
  weeklyUnlock: WeeklyUnlockInfo | null
  canUnlockThisWeek: boolean
}

export interface AccessState {
  access: AccessResponse | null
  tier: AccessTier
  isGuest: boolean
  isRookie: boolean
  isPro: boolean
  weeklyUnlock: WeeklyUnlockInfo | null
  canUnlockThisWeek: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Client-side view of the current viewer's access state, backed by /api/access
 * (the server is always the source of truth). Uses the same plain-fetch pattern
 * as useLiveBoard — no SWR dependency. Call `refresh()` after an unlock or an
 * auth change to re-pull the state.
 */
export function useAccess(): AccessState {
  const [access, setAccess] = useState<AccessResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/access", { credentials: "include" })
      if (!res.ok) throw new Error(`Access request failed (${res.status})`)
      const data: AccessResponse = await res.json()
      setAccess(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load access state")
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

  const tier: AccessTier = access?.tier ?? "guest"
  return {
    access,
    tier,
    isGuest: tier === "guest",
    isRookie: tier === "rookie",
    isPro: tier === "pro",
    weeklyUnlock: access?.weeklyUnlock ?? null,
    canUnlockThisWeek: access?.canUnlockThisWeek ?? false,
    loading,
    error,
    refresh: load,
  }
}
