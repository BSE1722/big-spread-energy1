"use client"

import { useEffect } from "react"
import { Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UnlockDialogProps {
  open: boolean
  matchup: string | null
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation required before a Rookie spends their ONE weekly breakdown, so
 * an accidental tap can't waste it. Lightweight custom modal (no extra deps),
 * with Escape-to-close and a focus-friendly layout.
 */
export function UnlockDialog({ open, matchup, busy, error, onConfirm, onCancel }: UnlockDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-dialog-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => !busy && onCancel()}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-xl border border-primary/30 bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={() => !busy && onCancel()}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>

        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1">
          <Sparkles className="size-3.5 text-primary" />
          <span className="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-primary">
            Your free BSE breakdown
          </span>
        </div>

        <h2 id="unlock-dialog-title" className="text-balance font-display text-xl font-bold text-foreground">
          Use your weekly BSE Breakdown on {matchup ?? "this game"}?
        </h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          This is your one free full breakdown this week. Choose wisely — your next free breakdown
          resets Monday.
        </p>

        {error ? (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Unlocking…" : "Unlock game"}
          </Button>
        </div>
      </div>
    </div>
  )
}
