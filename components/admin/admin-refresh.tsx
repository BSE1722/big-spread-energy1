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

interface UsageQuota {
  current: number | null
  max: number | null
  remaining: number | null
}

interface UsageReport {
  fetchedAt: string
  perMinute: UsageQuota
  hourly: UsageQuota
  monthlyObjects: UsageQuota
  limitHit: "per-minute" | "hourly" | "monthly-objects" | "unknown"
}

function fmtQuota(q: UsageQuota | undefined): string {
  if (!q) return "—"
  const used = q.current ?? "?"
  const max = q.max != null ? q.max : "?"
  const rem = q.remaining != null ? ` (${q.remaining} left)` : ""
  return `${used} / ${max}${rem}`
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
  const [loading, setLoading] = useState<"idle" | "status" | "refresh" | "usage">("idle")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [usage, setUsage] = useState<UsageReport | null>(null)

  async function checkStatus() {
    setError(null)
    setNotice(null)
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
    setNotice(null)
    setLoading("refresh")
    try {
      const res = await fetch("/api/admin/refresh-odds", {
        method: "POST",
        headers: { "x-admin-secret": secret },
      })
      const data = await res.json()

      // Rate limited (429) or a refresh already running (409): show a clear,
      // non-destructive message. The frozen snapshot is unchanged either way.
      if (res.status === 429 || res.status === 409) {
        if (data?.usage) setUsage(data.usage as UsageReport)
        setNotice(data?.error ?? "SportsGameOdds is temporarily unavailable. Snapshot unchanged.")
        return
      }
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

  async function checkUsage() {
    setError(null)
    setNotice(null)
    setLoading("usage")
    try {
      const res = await fetch("/api/admin/refresh-odds?usage=1", {
        method: "GET",
        headers: { "x-admin-secret": secret },
      })
      const data = await res.json()
      if (res.status === 429) {
        setNotice(data?.error ?? "SportsGameOdds rate limit reached.")
        return
      }
      if (!res.ok) throw new Error(data?.error ?? `Usage lookup failed (${res.status})`)
      setUsage(data.usage as UsageReport)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Usage lookup failed")
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
        <button
          type="button"
          onClick={checkUsage}
          disabled={busy || !secret}
          className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === "usage" ? "Checking…" : "Check SGO usage"}
        </button>
      </div>

      {error && (
        <div className="mt-5 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-5 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          <p className="font-semibold">Refresh not applied</p>
          <p className="mt-1">{notice}</p>
        </div>
      )}

      {usage && (
        <div className="mt-5 rounded-md border border-border bg-background px-4 py-3">
          <p className="text-sm font-semibold text-foreground">SportsGameOdds usage</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
            <dt className="text-muted-foreground">Per-minute requests</dt>
            <dd className="text-right text-foreground">{fmtQuota(usage.perMinute)}</dd>
            <dt className="text-muted-foreground">Hourly requests</dt>
            <dd className="text-right text-foreground">{fmtQuota(usage.hourly)}</dd>
            <dt className="text-muted-foreground">Monthly objects</dt>
            <dd className="text-right text-foreground">{fmtQuota(usage.monthlyObjects)}</dd>
            <dt className="text-muted-foreground">Limit currently hit</dt>
            <dd className="text-right text-foreground">{usage.limitHit}</dd>
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Values are best-effort readings from /account/usage; unknown fields show as “?”.
          </p>
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
