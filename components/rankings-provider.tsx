"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { resolveAbbr, getApTop25, type ApRankRow } from "@/lib/bse"

/**
 * Client-wide AP Top 25 access. Seeded on the server with the static poll so
 * first paint is correct, then fetches the DB-backed /api/ap-rankings once on
 * mount to pick up the latest poll (kept fresh weekly by the refresh-rankings
 * cron). Exposes a rank lookup so every "#6"-style badge across the site
 * updates from one place. Uses the project's plain-fetch pattern (no SWR
 * dependency). Any consumer rendered without the provider still works via the
 * static-seed fallback below.
 */

interface RankingsContextValue {
  poll: ApRankRow[]
  getRank: (input?: string | null) => number | undefined
}

function buildValue(poll: ApRankRow[]): RankingsContextValue {
  const byAbbr = new Map<string, number>()
  for (const row of poll) byAbbr.set(row.abbr, row.rank)
  return {
    poll,
    getRank: (input) => {
      const abbr = resolveAbbr(input)
      return abbr ? byAbbr.get(abbr) : undefined
    },
  }
}

const FALLBACK = buildValue(getApTop25())

const RankingsContext = createContext<RankingsContextValue | null>(null)

export function RankingsProvider({ seed, children }: { seed: ApRankRow[]; children: ReactNode }) {
  const [poll, setPoll] = useState<ApRankRow[]>(seed)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/ap-rankings")
        const data = (await res.json()) as { ok?: boolean; poll?: ApRankRow[] }
        if (cancelled) return
        if (res.ok && data.ok && Array.isArray(data.poll) && data.poll.length) {
          setPoll(data.poll)
        }
      } catch {
        // Keep the server seed on any failure — ranks stay rendered.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(() => buildValue(poll), [poll])

  return <RankingsContext.Provider value={value}>{children}</RankingsContext.Provider>
}

export function useRankings(): RankingsContextValue {
  return useContext(RankingsContext) ?? FALLBACK
}
