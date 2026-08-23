"use client"

import { useEffect, useState } from "react"
import { Sparkles, X } from "lucide-react"
import type { LiveBoardGame } from "@/lib/use-live-board"
import { Button } from "@/components/ui/button"

interface UnlockDialogProps {
  /** The game to unlock, or null when the dialog is closed. */
  game: LiveBoardGame | null
  onClose: () => void
  /** Called after a successful unlock so the parent can refresh access state. */
  onUnlocked: () => void
}

/**
 * Confirmation required before a Rookie spends their ONE weekly breakdown, so
 * an accidental tap can't waste it. Owns the POST /api/unlock call. The server
 * is the source of truth (unique constraint on user+season+week); this dialog
 * only reflects its result. Lightweight custom modal (no extra deps).
 */
export function UnlockDialog({ game, onClose, onUnlocked }: UnlockDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = game != null
  const matchup = game ? `${game.away.name} vs ${game.home.name}` : null

  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || !game) return null

  async function confirm() {
    if (!game) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: game.id }),
      })
      const text = await res.text()
      let data: { ok?: boolean; error?: string } = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = {}
      }
      if (!res.ok || !data.ok) {
        setError(data.error || `Unable to unlock (HTTP ${res.status}).`)
        setBusy(false)
        return
      }
      onUnlocked()
    } catch {
      setError("Network error. Please try again.")
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-dialog-title"
    >
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />

      <div className="relative w-full max-w-md rounded-xl border border-primary/30 bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={() => !busy && onClose()}
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
          Use your weekly BSE Breakdown on {matchup}?
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
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy} className="font-display font-semibold uppercase tracking-wide">
            {busy ? "Unlocking…" : "Unlock game"}
          </Button>
        </div>
      </div>
    </div>
  )
}
