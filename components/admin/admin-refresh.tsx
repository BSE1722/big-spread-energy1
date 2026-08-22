"use client"

import { useState } from "react"

interface SnapshotStatus {
  hasSnapshot: boolean
  snapshotAt: string | null
  previousSnapshotAt: string | null
  season: number | null
  week: number | null
  matched: number | null
  unmatched: number | null
}

interface RefreshResult {
  refreshed: number
  matched: number
  unmatched: number
  snapshotAt: string
  previousSnapshotAt: string | null
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function AdminRefresh() {
  const [secret, setSecret] = useState("")
  const [status, setStatus] = useState<SnapshotStatus | null>(null)
  const [result, setResult] = useState<RefreshResult | null>(null)
  const [loading, setLoading] = useState<"idle" | "status" | "refresh">("idle")
  const [error, setError] = useState<string | null>(null)

  async function checkStatus() {
    setError(null)
    setResult(null)
    setLoading("status")
    try {
      const res = await fetch("/api/admin/refresh-odds", {
        method: "GET",
        headers: { "x-admin-secret": secret },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
      setStatus(data as SnapshotStatus)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load status")
    } finally {
      setLoading("idle")
    }
  }

  async function refresh() {
    setError(null)
    setLoading("refresh")
    try {
      const res = await fetch("/api/admin/refresh-odds", {
        method: "POST",
        headers: { "x-admin-secret": secret },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `Refresh failed (${res.status})`)
      setResult(data as RefreshResult)
      // Reflect the new snapshot in the status panel too.
      setStatus({
        hasSnapshot: true,
        snapshotAt: data.snapshotAt,
        previousSnapshotAt: data.previousSnapshotAt,
        season: null,
        week: null,
        matched: data.matched,
        unmatched: data.unmatched,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed")
    } finally {
      setLoading("idle")
    }
  }

  const busy = loading !== "idle"

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <label htmlFor="admin-secret" className="block text-sm font-medium text-card-foreground">
        Admin secret
      </label>
      <input
        id="admin-secret"
        type="password"
        autoComplete="off"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        placeholder="Enter ADMIN_REFRESH_SECRET"
        className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Held in memory only for this request. Never stored or displayed.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={refresh}
          disabled={busy || !secret}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === "refresh" ? "Refreshing…" : "Refresh DraftKings Lines"}
        </button>
        <button
          type="button"
          onClick={checkStatus}
          disabled={busy || !secret}
          className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === "status" ? "Checking…" : "Check current snapshot"}
        </button>
      </div>

      {error && (
        <div className="mt-5 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-md border border-primary/40 bg-accent px-4 py-3">
          <p className="text-sm font-semibold text-accent-foreground">Snapshot refreshed</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs text-accent-foreground">
            <dt className="text-muted-foreground">Games refreshed</dt>
            <dd className="text-right">{result.refreshed}</dd>
            <dt className="text-muted-foreground">Matched</dt>
            <dd className="text-right">{result.matched}</dd>
            <dt className="text-muted-foreground">Unmatched</dt>
            <dd className="text-right">{result.unmatched}</dd>
            <dt className="text-muted-foreground">Snapshot time</dt>
            <dd className="text-right">{fmtTime(result.snapshotAt)}</dd>
            <dt className="text-muted-foreground">Previous snapshot</dt>
            <dd className="text-right">{fmtTime(result.previousSnapshotAt)}</dd>
          </dl>
        </div>
      )}

      {status && !result && (
        <div className="mt-5 rounded-md border border-border bg-background px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            {status.hasSnapshot ? "Current snapshot" : "No snapshot saved yet"}
          </p>
          {status.hasSnapshot && (
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
              <dt className="text-muted-foreground">Snapshot time</dt>
              <dd className="text-right text-foreground">{fmtTime(status.snapshotAt)}</dd>
              <dt className="text-muted-foreground">Matched</dt>
              <dd className="text-right text-foreground">{status.matched ?? "—"}</dd>
              <dt className="text-muted-foreground">Unmatched</dt>
              <dd className="text-right text-foreground">{status.unmatched ?? "—"}</dd>
              <dt className="text-muted-foreground">Previous snapshot</dt>
              <dd className="text-right text-foreground">{fmtTime(status.previousSnapshotAt)}</dd>
            </dl>
          )}
        </div>
      )}
    </div>
  )
}
