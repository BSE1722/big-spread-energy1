"use client"

import { useEffect, useState, useTransition } from "react"
import { recordReviewTicket } from "@/app/actions/review"
import type { RecordLegInput } from "@/lib/review/types"

/**
 * Admin-only "Save for grading" control shown on the public analyzer. It
 * snapshots the current ticket into the Postgame Review dataset, frozen at
 * analysis time.
 *
 * HONESTY: the recorder fills each leg's BSE Rating server-side from the SAME
 * canonical Board signal loader the customer saw (real 0–100 value, or null
 * when that game has no frozen signal). We never fabricate a rating, and this
 * client never supplies one.
 */
export interface SavableLeg {
  gameId: string // already `cfbd-<id>`
  season: number
  week: number
  kickoffIso: string | null
  homeTeam: string
  awayTeam: string
  pickSide: "home" | "away"
  pickLabel: string
  lineValue: number | null
  priceAmerican: number | null
  classification: string | null
  lineEdge: number | null
  fairLine: number | null
  altRecommendation: RecordLegInput["altRecommendation"]
}

export function SaveForGrading({
  legs,
  season,
  week,
  combinedAmerican,
}: {
  legs: SavableLeg[]
  season: number
  week: number
  combinedAmerican: number | null
}) {
  const [admin, setAdmin] = useState(false)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let active = true
    fetch("/api/admin/whoami")
      .then((r) => r.json())
      .then((d) => {
        if (active) setAdmin(Boolean(d?.admin))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  if (!admin || legs.length === 0) return null

  function save() {
    setMsg(null)
    const mapped: RecordLegInput[] = legs.map((l) => ({
      gameId: l.gameId,
      season: l.season,
      week: l.week,
      homeTeam: l.homeTeam,
      awayTeam: l.awayTeam,
      kickoffIso: l.kickoffIso,
      market: "spread",
      pickSide: l.pickSide,
      pickLabel: l.pickLabel,
      lineValue: l.lineValue,
      priceAmerican: l.priceAmerican,
      // bseRating intentionally omitted — recorder captures the canonical value
      classification: l.classification,
      lineEdge: l.lineEdge,
      fairLine: l.fairLine,
      altRecommendation: l.altRecommendation,
    }))

    startTransition(async () => {
      const res = await recordReviewTicket({
        source: "analyzer",
        season,
        week,
        combinedPriceAmerican: combinedAmerican,
        legs: mapped,
      })
      setMsg(res.ok ? { ok: true, text: res.message ?? "Saved." } : { ok: false, text: res.error })
    })
  }

  return (
    <div className="mt-3 flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded-lg border border-border bg-secondary/60 px-4 py-2 font-mono text-xs uppercase tracking-wide text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save ticket for grading (admin)"}
      </button>
      {msg && <p className={`text-[11px] ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
      {!msg && (
        <p className="text-[11px] text-muted-foreground">
          Freezes this ticket into the Postgame Review dataset, capturing each leg&apos;s BSE Rating exactly as shown
          at analysis time.
        </p>
      )}
    </div>
  )
}
