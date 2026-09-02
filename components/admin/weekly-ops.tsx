"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import type { StageStatus, StageView, WeeklyOpsSnapshot } from "@/lib/weekly-ops/service"

/**
 * WEEKLY OPERATIONS control panel (presentational).
 *
 * The snapshot is computed + authorized server-side (app/admin/page.tsx) and
 * passed in as props — this component only renders it and triggers the existing
 * server route for "Generate BSE Ratings". It NEVER derives ratings, prices, or
 * statuses on the client; it displays exactly what the server reported.
 */

const STATUS_STYLE: Record<StageStatus, { label: string; cls: string }> = {
  READY: { label: "Ready", cls: "bg-primary/15 text-primary border-primary/30" },
  NEEDS_ACTION: { label: "Needs action", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  COMPLETE: { label: "Complete", cls: "bg-secondary text-foreground border-border" },
  BLOCKED: { label: "Blocked", cls: "bg-muted text-muted-foreground border-border" },
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
}

async function readResponseSafely(res: Response) {
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

interface CaptureSummary {
  featureRows: number
  evaluated: number
  fired: number
  inserted: number
  skippedNoLine: number
  skippedStarted: number
  skippedDup: number
  skippedInvalid: number
  snapsRecorded: number
  snapshotAgeHours: number
}

export function WeeklyOps({ snap }: { snap: WeeklyOpsSnapshot }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<CaptureSummary | null>(null)

  const m = snap.metrics
  const ratingsStage = snap.stages.find((s) => s.key === "ratings")
  const canGenerate = ratingsStage?.status === "READY" || ratingsStage?.status === "COMPLETE"
  const busy = running || pending

  async function generateRatings() {
    setError(null)
    setNotice(null)
    setResult(null)
    setRunning(true)
    try {
      const res = await fetch("/api/admin/generate-ratings", { method: "POST" })
      const { status, json, rawText } = await readResponseSafely(res)
      if (!json) {
        setNotice(`Server returned a non-JSON response (HTTP ${status})${rawText ? `: ${rawText.slice(0, 200)}` : ""}`)
        return
      }
      // 409 = fail-closed (no/stale snapshot). Nothing written; show clearly.
      if (status === 409) {
        setNotice((json.error as string) ?? "Capture blocked. Nothing was written.")
        return
      }
      if (!res.ok) throw new Error((json.error as string) ?? `Generate failed (${status})`)
      setResult(json.summary as unknown as CaptureSummary)
      // Re-fetch the server-computed status so every stage updates.
      startTransition(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      {/* Header row: week + frozen model identity */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {snap.season} · {snap.weekLabel}
          </p>
          <h3 className="mt-1 font-display text-lg font-bold text-foreground">Run the week</h3>
        </div>
        {snap.model ? (
          <div className="rounded-md border border-border bg-background px-3 py-2 text-right">
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Frozen model</p>
            <p className="mt-0.5 font-mono text-xs text-foreground">
              {snap.model.modelHash.slice(0, 12)} · {snap.model.nTrees ?? "?"} trees
            </p>
          </div>
        ) : (
          <span className="rounded border border-amber-500/30 bg-amber-500/15 px-2 py-1 font-mono text-[11px] text-amber-500">
            No frozen model
          </span>
        )}
      </div>

      {/* Metrics */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Scheduled" value={m.scheduledGames} />
        <Metric label="With features" value={m.gamesWithFeatures} />
        <Metric label="With DK line" value={m.gamesWithDkOdds} />
        <Metric label="Rated" value={m.gamesWithRatings} accent />
      </div>
      <p className="mt-3 font-mono text-[11px] text-muted-foreground">
        DK snapshot: {fmtTime(m.dkSnapshotAt)}
        {m.dkSnapshotAgeHours != null ? ` · ${m.dkSnapshotAgeHours}h old` : ""} · immutable signals this week:{" "}
        {m.immutableShadowSignals} · official picks locked: {m.officialPublishedPicks}
      </p>

      {/* Stage list */}
      <ol className="mt-6 space-y-2">
        {snap.stages.map((stage, i) => (
          <StageRow key={stage.key} index={i + 1} stage={stage} />
        ))}
      </ol>

      {/* Generate action */}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button
          type="button"
          onClick={generateRatings}
          disabled={busy || !canGenerate}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Generating…" : "Generate BSE Ratings"}
        </button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Scores the frozen model on this week&apos;s games using the current DraftKings snapshot. Adds zero external
          API calls; never retrains the model or overwrites a locked signal.
        </p>
      </div>

      {!canGenerate && ratingsStage && (
        <p className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          {ratingsStage.detail}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          <p className="font-semibold">Nothing written</p>
          <p className="mt-1">{notice}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-md border border-primary/40 bg-accent px-4 py-3">
          <p className="text-sm font-semibold text-accent-foreground">Ratings generated</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs text-accent-foreground">
            <dt className="text-muted-foreground">Board rows written</dt>
            <dd className="text-right">{result.evaluated}</dd>
            <dt className="text-muted-foreground">Signals fired (|edge|≥1)</dt>
            <dd className="text-right">{result.fired}</dd>
            <dt className="text-muted-foreground">New immutable signals</dt>
            <dd className="text-right">{result.inserted}</dd>
            <dt className="text-muted-foreground">Already existed (dedup)</dt>
            <dd className="text-right">{result.skippedDup}</dd>
            <dt className="text-muted-foreground">Skipped — no DK line</dt>
            <dd className="text-right">{result.skippedNoLine}</dd>
            <dt className="text-muted-foreground">Skipped — kickoff passed</dt>
            <dd className="text-right">{result.skippedStarted}</dd>
            <dt className="text-muted-foreground">Skipped — invalid features</dt>
            <dd className="text-right">{result.skippedInvalid}</dd>
            <dt className="text-muted-foreground">DK snapshots recorded</dt>
            <dd className="text-right">{result.snapsRecorded}</dd>
          </dl>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  )
}

function StageRow({ index, stage }: { index: number; stage: StageView }) {
  const style = STATUS_STYLE[stage.status]
  return (
    <li className="flex items-start gap-3 rounded-md border border-border bg-background px-4 py-3">
      <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-secondary font-mono text-xs font-semibold text-foreground">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-sm font-semibold text-foreground">{stage.title}</p>
          <span className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${style.cls}`}>
            {style.label}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{stage.detail}</p>
        {stage.notes && stage.notes.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {stage.notes.map((n, i) => (
              <li key={i} className="font-mono text-[11px] text-muted-foreground">
                • {n}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}
