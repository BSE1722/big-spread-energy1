"use client"

import { useMemo, useState } from "react"
import { Lock } from "lucide-react"
import type { PerformanceSummary } from "@/lib/predictions/service"
import { type PredictionView, formatAmerican, formatUnits } from "@/lib/predictions/view"
import { UnitsChart } from "@/components/performance/units-chart"

type FilterKey = "all" | "week" | "spread" | "total" | "graded" | "pending"

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "week", label: "This Week" },
  { key: "spread", label: "Spread" },
  { key: "total", label: "Total" },
  { key: "graded", label: "Graded" },
  { key: "pending", label: "Pending" },
]

export function PerformanceView({
  predictions,
  summary,
  currentSeason,
  currentWeek,
}: {
  predictions: PredictionView[]
  summary: PerformanceSummary
  currentSeason: number
  currentWeek: number
}) {
  const [filter, setFilter] = useState<FilterKey>("all")

  const rows = useMemo(() => {
    switch (filter) {
      case "week":
        return predictions.filter((p) => p.season === currentSeason && p.week === currentWeek)
      case "spread":
        return predictions.filter((p) => p.market === "spread")
      case "total":
        return predictions.filter((p) => p.market === "total")
      case "graded":
        return predictions.filter((p) => p.status === "graded")
      case "pending":
        return predictions.filter((p) => p.status !== "graded")
      default:
        return predictions
    }
  }, [predictions, filter, currentSeason, currentWeek])

  const unitsPositive = summary.unitsDelta >= 0

  return (
    <div className="space-y-8">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Record"
          value={`${summary.record.wins}-${summary.record.losses}-${summary.record.pushes}`}
        />
        <Kpi label="Win Rate" value={summary.winRatePct == null ? "—" : `${summary.winRatePct.toFixed(1)}%`} />
        <Kpi
          label="Units +/-"
          value={formatUnits(summary.unitsDelta)}
          tone={summary.totalGraded === 0 ? "neutral" : unitsPositive ? "positive" : "negative"}
        />
        <Kpi
          label="Overall ROI"
          value={summary.overallRoiPct == null ? "—" : `${summary.overallRoiPct > 0 ? "+" : ""}${summary.overallRoiPct.toFixed(1)}%`}
          tone={summary.overallRoiPct == null ? "neutral" : summary.overallRoiPct >= 0 ? "positive" : "negative"}
        />
      </div>

      {/* Chart + ATS split */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
              Cumulative Units
            </h2>
            <span className="font-mono text-xs text-muted-foreground">
              {summary.totalGraded} graded pick{summary.totalGraded === 1 ? "" : "s"}
            </span>
          </div>
          <UnitsChart points={summary.cumulative} />
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            ATS (Spread only)
          </h2>
          <dl className="space-y-2 text-sm">
            <Row label="Record">
              {summary.ats.wins}-{summary.ats.losses}-{summary.ats.pushes}
            </Row>
            <Row label="Units">{formatUnits(summary.ats.unitsDelta)}</Row>
            <Row label="ATS ROI">
              {summary.ats.roiPct == null
                ? "—"
                : `${summary.ats.roiPct > 0 ? "+" : ""}${summary.ats.roiPct.toFixed(1)}%`}
            </Row>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            ATS ROI counts spread picks only and is never blended into Overall ROI.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-1.5 font-display text-xs font-semibold uppercase tracking-wide transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <PredictionsTable rows={rows} />

      {/* Integrity note */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Every Official BSE Pick is frozen at publication, before kickoff. The lock hash is an
        internal tamper-evidence record, not a claim of third-party cryptographic verification.
        Losses and pushes are never removed. Corrections are appended and shown alongside the
        original — the original is never rewritten.
      </p>
    </div>
  )
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "neutral" | "positive" | "negative"
}) {
  const toneClass =
    tone === "positive" ? "text-primary" : tone === "negative" ? "text-destructive" : "text-foreground"
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold sm:text-3xl ${toneClass}`}>{value}</p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </div>
  )
}

function PredictionsTable({ rows }: { rows: PredictionView[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No official picks in this view yet. Published picks appear here the moment they are frozen.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-secondary/50 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>Matchup</Th>
            <Th>Pick</Th>
            <Th>Line</Th>
            <Th>Published</Th>
            <Th>Kickoff</Th>
            <Th>Result</Th>
            <Th>Grade</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <Td>
                <div className="font-medium text-foreground">{r.matchup}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {r.marketLabel} · {r.book}
                </div>
              </Td>
              <Td>
                <div className="font-semibold text-foreground">{r.pickLabel}</div>
                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {formatAmerican(r.priceAmerican)}
                </div>
              </Td>
              <Td className="font-mono text-xs">
                {r.market === "moneyline" ? "ML" : r.lineValue != null ? r.lineValue : "—"}
              </Td>
              <Td className="whitespace-nowrap">{fmtStamp(r.publishedAtIso)}</Td>
              <Td className="whitespace-nowrap">{fmtStamp(r.kickoffIso)}</Td>
              <Td className="font-mono">{r.scoreLabel ?? "—"}</Td>
              <Td>
                <div className="flex flex-wrap items-center gap-1.5">
                  <GradeBadge status={r.status} grade={r.grade} />
                  {r.unitsDelta != null && r.status === "graded" && (
                    <span
                      className={`font-mono text-[11px] ${
                        r.unitsDelta > 0
                          ? "text-primary"
                          : r.unitsDelta < 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }`}
                    >
                      {formatUnits(r.unitsDelta)}
                    </span>
                  )}
                  {r.hasCorrection && <CorrectionBadge corrections={r.corrections} />}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GradeBadge({ status, grade }: { status: string; grade: string | null }) {
  if (status !== "graded" || !grade) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Lock className="size-3" aria-hidden="true" />
        Pending
      </span>
    )
  }
  const map: Record<string, string> = {
    win: "bg-primary/15 text-primary",
    loss: "bg-destructive/15 text-destructive",
    push: "bg-muted text-muted-foreground",
  }
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${map[grade] ?? ""}`}>
      {grade}
    </span>
  )
}

function CorrectionBadge({ corrections }: { corrections: PredictionView["corrections"] }) {
  const first = corrections[0]
  return (
    <span
      className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-500"
      title={
        first
          ? `Correction: ${first.field} — ${first.reason} (original retained)`
          : "Correction recorded; original retained"
      }
    >
      Corrected
    </span>
  )
}

function fmtStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2.5 font-normal">{children}</th>
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 text-foreground ${className}`}>{children}</td>
}
