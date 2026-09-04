"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { recordReviewTicket } from "@/app/actions/review"
import type { RecordLegInput } from "@/lib/review/types"

/**
 * Admin recorder. Builds a ticket by adding legs manually and freezes it.
 *
 * HONESTY: the BSE Rating field is optional. If no real rating existed at
 * analysis time, LEAVE IT BLANK — it is stored as null (unrated) and excluded
 * from calibration. The field never auto-fills a number.
 */
type DraftLeg = {
  season: string
  week: string
  gameId: string
  homeTeam: string
  awayTeam: string
  pickSide: "home" | "away"
  pickLabel: string
  lineValue: string
  priceAmerican: string
  bseRating: string
}

function emptyLeg(season: string, week: string): DraftLeg {
  return {
    season,
    week,
    gameId: "",
    homeTeam: "",
    awayTeam: "",
    pickSide: "home",
    pickLabel: "",
    lineValue: "",
    priceAmerican: "",
    bseRating: "",
  }
}

export function ReviewRecorder() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [season, setSeason] = useState("2025")
  const [week, setWeek] = useState("1")
  const [title, setTitle] = useState("")
  const [combined, setCombined] = useState("")
  const [legs, setLegs] = useState<DraftLeg[]>([emptyLeg("2025", "1")])

  function update(i: number, patch: Partial<DraftLeg>) {
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function addLeg() {
    setLegs((prev) => [...prev, emptyLeg(season, week)])
  }

  function removeLeg(i: number) {
    setLegs((prev) => prev.filter((_, idx) => idx !== i))
  }

  function submit() {
    setMsg(null)
    // Validate + map to the action input. Rating parses to null when blank.
    const parsed: RecordLegInput[] = []
    for (const [i, l] of legs.entries()) {
      if (!l.homeTeam.trim() || !l.awayTeam.trim() || !l.pickLabel.trim()) {
        setMsg({ ok: false, text: `Leg ${i + 1}: teams and pick label are required.` })
        return
      }
      const lineValue = l.lineValue.trim() === "" ? null : Number(l.lineValue)
      const priceAmerican = l.priceAmerican.trim() === "" ? null : Number(l.priceAmerican)
      const bseRating = l.bseRating.trim() === "" ? null : Number(l.bseRating)
      if (lineValue != null && Number.isNaN(lineValue)) {
        setMsg({ ok: false, text: `Leg ${i + 1}: line must be a number.` })
        return
      }
      if (bseRating != null && (Number.isNaN(bseRating) || bseRating < 0 || bseRating > 100)) {
        setMsg({ ok: false, text: `Leg ${i + 1}: rating must be 0–100 (or blank for unrated).` })
        return
      }
      parsed.push({
        gameId: l.gameId.trim() || null,
        season: Number(l.season) || Number(season),
        week: Number(l.week) || Number(week),
        homeTeam: l.homeTeam.trim(),
        awayTeam: l.awayTeam.trim(),
        pickSide: l.pickSide,
        pickLabel: l.pickLabel.trim(),
        lineValue,
        priceAmerican,
        bseRating, // null when blank — never fabricated
      })
    }

    startTransition(async () => {
      const res = await recordReviewTicket({
        title: title.trim() || null,
        source: "admin",
        season: Number(season),
        week: Number(week),
        combinedPriceAmerican: combined.trim() === "" ? null : Number(combined),
        legs: parsed,
      })
      if (res.ok) {
        setMsg({ ok: true, text: res.message ?? "Recorded." })
        setLegs([emptyLeg(season, week)])
        setTitle("")
        setCombined("")
        router.refresh()
      } else {
        setMsg({ ok: false, text: res.error })
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Season">
          <input value={season} onChange={(e) => setSeason(e.target.value)} inputMode="numeric" className={inputCls} />
        </Labeled>
        <Labeled label="Week">
          <input value={week} onChange={(e) => setWeek(e.target.value)} inputMode="numeric" className={inputCls} />
        </Labeled>
      </div>
      <div className="mt-3">
        <Labeled label="Title (optional)">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 1 opener" className={inputCls} />
        </Labeled>
      </div>
      <div className="mt-3">
        <Labeled label="Combined price (optional)">
          <input value={combined} onChange={(e) => setCombined(e.target.value)} placeholder="e.g. +650" className={inputCls} />
        </Labeled>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {legs.map((l, i) => (
          <div key={i} className="rounded-md border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Leg {i + 1}</span>
              {legs.length > 1 && (
                <button type="button" onClick={() => removeLeg(i)} className="font-mono text-[11px] text-destructive hover:underline">
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Away team">
                <input value={l.awayTeam} onChange={(e) => update(i, { awayTeam: e.target.value })} className={inputCls} />
              </Labeled>
              <Labeled label="Home team">
                <input value={l.homeTeam} onChange={(e) => update(i, { homeTeam: e.target.value })} className={inputCls} />
              </Labeled>
            </div>
            <div className="mt-2">
              <Labeled label="Pick label">
                <input value={l.pickLabel} onChange={(e) => update(i, { pickLabel: e.target.value })} placeholder="e.g. Georgia Tech -2.5" className={inputCls} />
              </Labeled>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Labeled label="Pick side">
                <select value={l.pickSide} onChange={(e) => update(i, { pickSide: e.target.value as "home" | "away" })} className={inputCls}>
                  <option value="home">Home</option>
                  <option value="away">Away</option>
                </select>
              </Labeled>
              <Labeled label="CFBD game id (for grading)">
                <input value={l.gameId} onChange={(e) => update(i, { gameId: e.target.value })} placeholder="cfbd-401..." className={inputCls} />
              </Labeled>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Labeled label="Line (to pick)">
                <input value={l.lineValue} onChange={(e) => update(i, { lineValue: e.target.value })} placeholder="-2.5" className={inputCls} />
              </Labeled>
              <Labeled label="Price">
                <input value={l.priceAmerican} onChange={(e) => update(i, { priceAmerican: e.target.value })} placeholder="-110" className={inputCls} />
              </Labeled>
              <Labeled label="BSE Rating">
                <input value={l.bseRating} onChange={(e) => update(i, { bseRating: e.target.value })} placeholder="blank" className={inputCls} />
              </Labeled>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={addLeg} className="mt-3 w-full rounded-md border border-dashed border-border py-2 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
        + Add leg
      </button>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Leave BSE Rating blank if no real rating existed at analysis time — it is stored as unrated, never
        fabricated. Add the CFBD game id (<span className="font-mono">cfbd-&lt;id&gt;</span>) so the leg can be
        graded from official finals.
      </p>

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-4 w-full rounded-md bg-primary py-2.5 font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Recording…" : "Record ticket"}
      </button>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
    </div>
  )
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-muted-foreground/50"

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
