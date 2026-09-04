"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { gradeReviewTickets } from "@/app/actions/review"

/**
 * Runs CFBD grading for all pending review legs. Reuses the same API-conserving
 * engine as Official Picks (one CFBD call per week group). Grading only fills
 * the graded zone of still-pending legs; it never touches frozen pregame data.
 */
export function ReviewGradeButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function run() {
    setMsg(null)
    startTransition(async () => {
      const res = await gradeReviewTickets()
      setMsg(res.ok ? { ok: true, text: res.message ?? "Done." } : { ok: false, text: res.error })
      if (res.ok) router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 font-display text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Grading…" : "Grade finals"}
      </button>
      {msg && (
        <p className={`max-w-xs text-right text-[11px] leading-tight ${msg.ok ? "text-primary" : "text-destructive"}`}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
