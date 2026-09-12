"use client"

import { useState, useTransition } from "react"
import { Save } from "lucide-react"
import { setToolLimitsAction } from "@/app/actions/tools"
import type { ToolLimits } from "@/lib/config/service"

/**
 * Admin control for the free-tier tool limits. Writes go through
 * setToolLimitsAction (server re-checks admin), so a saved change takes effect
 * live for every free user's next usage check — no redeploy.
 */
export function ToolConfig({ initial }: { initial: ToolLimits }) {
  const [analyzer, setAnalyzer] = useState(String(initial.analyzerFreeWeekly))
  const [parlaid, setParlaid] = useState(String(initial.parlaidFreeWeekly))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function parseNonNeg(s: string): number | null {
    const n = Number(s.trim())
    if (!Number.isFinite(n) || n < 0) return null
    return Math.floor(n)
  }

  function save() {
    setMsg(null)
    const a = parseNonNeg(analyzer)
    const p = parseNonNeg(parlaid)
    if (a == null || p == null) {
      setMsg({ ok: false, text: "Enter whole non-negative numbers." })
      return
    }
    startTransition(async () => {
      const res = await setToolLimitsAction({ analyzerFreeWeekly: a, parlaidFreeWeekly: p })
      if (res.ok) {
        setAnalyzer(String(res.limits.analyzerFreeWeekly))
        setParlaid(String(res.limits.parlaidFreeWeekly))
        setMsg({ ok: true, text: "Saved. New limits are live for free users." })
      } else {
        setMsg({ ok: false, text: res.error })
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Analyzer — free runs / week
          </span>
          <input
            inputMode="numeric"
            value={analyzer}
            onChange={(e) => setAnalyzer(e.target.value)}
            className="h-11 w-28 rounded-md border border-input bg-background px-3 text-base tabular-nums text-foreground outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Getting Parlaid — free runs / week
          </span>
          <input
            inputMode="numeric"
            value={parlaid}
            onChange={(e) => setParlaid(e.target.value)}
            className="h-11 w-28 rounded-md border border-input bg-background px-3 text-base tabular-nums text-foreground outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Save className="size-4" />
          {pending ? "Saving…" : "Save limits"}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</span>}
      </div>
      <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
        BSE Pro is always unlimited. Limits reset each week automatically; changing them here never erases anyone&apos;s
        past analyses.
      </p>
    </div>
  )
}
