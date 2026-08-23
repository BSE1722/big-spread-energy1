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
  unlimited: boolean
  exceeded: boolean
}

interface UsageWindow {
  requests: UsageQuota
  entities: UsageQuota
}

interface UsageReport {
  fetchedAt: string
  tier: string | null
  perMinute: UsageWindow
  perHour: UsageWindow
  perDay: UsageWindow
  perMonth: UsageWindow
  limitHit: string
  parsed: boolean
  error?: { httpStatus: number | null; body: string }
}

function fmtQuota(q: UsageQuota | undefined): string {
  if (!q) return "—"
  if (q.unlimited) return "unlimited"
  const used = q.current != null ? q.current.toLocaleString() : "—"
  const max = q.max != null ? q.max.toLocaleString() : "—"
  const rem = q.remaining != null ? ` (${q.remaining.toLocaleString()} left)` : ""
  return `${used} / ${max}${rem}`
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

/**
 * Read a fetch Response WITHOUT assuming it is JSON. An empty body, HTML error
 * page, or a gateway/timeout response would make res.json() throw; instead we
 * read the text once and parse defensively. Returns the parsed JSON when
 * possible, plus the raw text and status so callers can show the real problem.
 */
async function readResponseSafely(res: Response): Promise<{
  ok: boolean
  status: number
  json: Record<string, unknown> | null
  rawText: string
}> {
  const rawText = await res.text().catch(() => "")
  let json: Record<string, unknown> | null = null
  const contentType = res.headers.get("content-type") ?? ""
  if (rawText && (contentType.includes("application/json") || rawText.trimStart().startsWith("{"))) {
    try {
      json = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      json = null
    }
  }
  return { ok: res.ok, status: res.status, json, rawText }
}

/** Build a human message when the response body was not usable JSON. */
function nonJsonMessage(status: number, rawText: string): string {
  const body = rawText.trim().slice(0, 300)
  const suffix = body ? `: ${body}` : " (empty response body)"
  return `Server returned a non-JSON response (HTTP ${status})${suffix}`
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
      const { status, json, rawText } = await readResponseSafely(res)
      if (!json) throw new Error(nonJsonMessage(status, rawText))
      if (!res.ok) throw new Error((json.error as string) ?? `Request failed (${status})`)
      setStatus(json as unknown as SnapshotStatus)
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
      const { status, json, rawText } = await readResponseSafely(res)

      // Non-JSON / empty body (gateway error, timeout, etc.): show status + body.
      if (!json) {
        setNotice(nonJsonMessage(status, rawText))
        return
      }

      // Rate limited (429) or a refresh already running (409): show a clear,
      // non-destructive message. The frozen snapshot is unchanged either way.
      if (status === 429 || status === 409) {
        if (json.usage) setUsage(json.usage as unknown as UsageReport)
        setNotice((json.error as string) ?? "SportsGameOdds is temporarily unavailable. Snapshot unchanged.")
        return
      }
      if (!res.ok) throw new Error((json.error as string) ?? `Refresh failed (${status})`)

      setResult(json as unknown as RefreshResult)
      // Reflect the new snapshot in the status panel too.
      setStatus({
        hasSnapshot: true,
        snapshotAt: json.snapshotAt as string,
        previousSnapshotAt: (json.previousSnapshotAt as string) ?? null,
        season: null,
        week: null,
        matched: json.matched as number,
        unmatched: json.unmatched as number,
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
      const { status, json, rawText } = await readResponseSafely(res)
      if (!json) throw new Error(nonJsonMessage(status, rawText))
      if (status === 429) {
        setNotice((json.error as string) ?? "SportsGameOdds rate limit reached.")
        return
      }
      if (!res.ok) throw new Error((json.error as string) ?? `Usage lookup failed (${status})`)
      setUsage(json.usage as unknown as UsageReport)
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
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">SportsGameOdds usage</p>
            {usage.tier && (
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">
                tier: {usage.tier}
              </span>
            )}
          </div>

          {usage.error ? (
            <div className="mt-2">
              <p className="font-mono text-xs text-destructive-foreground">
                HTTP {usage.error.httpStatus ?? "?"} — unexpected response
              </p>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-secondary p-2 font-mono text-[11px] text-foreground">
                {usage.error.body}
              </pre>
            </div>
          ) : (
            <>
              <table className="mt-2 w-full font-mono text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 text-left font-medium">Window</th>
                    <th className="py-1 text-right font-medium">Requests (used / max)</th>
                    <th className="py-1 text-right font-medium">Objects (used / max)</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Per-minute", usage.perMinute],
                      ["Per-hour", usage.perHour],
                      ["Per-day", usage.perDay],
                      ["Per-month", usage.perMonth],
                    ] as const
                  ).map(([label, w]) => (
                    <tr key={label} className="border-t border-border/60">
                      <td className="py-1 text-left text-foreground">{label}</td>
                      <td
                        className={`py-1 text-right ${w.requests.exceeded ? "font-semibold text-destructive-foreground" : "text-foreground"}`}
                      >
                        {fmtQuota(w.requests)}
                      </td>
                      <td
                        className={`py-1 text-right ${w.entities.exceeded ? "font-semibold text-destructive-foreground" : "text-foreground"}`}
                      >
                        {fmtQuota(w.entities)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Limit currently hit</span>
                <span
                  className={
                    usage.limitHit === "unknown"
                      ? "font-mono text-foreground"
                      : "font-mono font-semibold text-destructive-foreground"
                  }
                >
                  {usage.limitHit}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {'"Objects" are SGO entities. "unlimited" means no cap for that field. Read at '}
                {fmtTime(usage.fetchedAt)}.
              </p>
            </>
          )}
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
