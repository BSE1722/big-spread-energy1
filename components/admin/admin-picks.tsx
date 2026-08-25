"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { PublishableGame } from "@/lib/predictions/service"
import type { GradingRun } from "@/lib/predictions/service"
import { type PredictionView, formatAmerican, formatUnits } from "@/lib/predictions/view"
import {
  publishOfficialPick,
  submitCorrection,
  triggerManualGrading,
} from "@/app/actions/predictions"

type Msg = { tone: "ok" | "err"; text: string } | null

export function AdminPicks({
  publishable,
  predictions,
  runs,
}: {
  publishable: PublishableGame[]
  predictions: PredictionView[]
  runs: GradingRun[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<Msg>(null)

  return (
    <div className="space-y-8">
      {msg && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            msg.tone === "ok"
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {msg.text}
        </div>
      )}

      <GradeControl
        pending={pending}
        onGrade={() =>
          startTransition(async () => {
            const res = await triggerManualGrading()
            setMsg(res.ok ? { tone: "ok", text: res.message ?? "Grading complete." } : { tone: "err", text: res.error })
            if (res.ok) router.refresh()
          })
        }
        runs={runs}
      />

      <PublishPanel
        publishable={publishable}
        disabled={pending}
        onPublish={(gameId, market, pickSide, label) =>
          startTransition(async () => {
            const res = await publishOfficialPick({ gameId, market, pickSide })
            setMsg(
              res.ok
                ? { tone: "ok", text: `Published & locked: ${label}` }
                : { tone: "err", text: res.error },
            )
            if (res.ok) router.refresh()
          })
        }
      />

      <PublishedList
        predictions={predictions}
        disabled={pending}
        onCorrect={(input) =>
          startTransition(async () => {
            const res = await submitCorrection(input)
            setMsg(res.ok ? { tone: "ok", text: res.message ?? "Correction recorded." } : { tone: "err", text: res.error })
            if (res.ok) router.refresh()
          })
        }
      />
    </div>
  )
}

/* ------------------------------- Grade ---------------------------------- */

function GradeControl({
  pending,
  onGrade,
  runs,
}: {
  pending: boolean
  onGrade: () => void
  runs: GradingRun[]
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">Grade Finals</h3>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Grades every locked pick whose game is truly final. Runs Neon-first: if nothing is
            eligible it makes zero CFBD calls, and at most one CFBD call per week group. Already-graded
            picks are never rechecked.
          </p>
        </div>
        <button
          type="button"
          onClick={onGrade}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Working…" : "Grade Finals Now"}
        </button>
      </div>

      {runs.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-secondary/50 font-mono uppercase tracking-wide text-muted-foreground">
              <tr>
                <ThX>Started</ThX>
                <ThX>Trigger</ThX>
                <ThX>Eligible</ThX>
                <ThX>Groups</ThX>
                <ThX>CFBD reqs</ThX>
                <ThX>Graded</ThX>
                <ThX>Reason</ThX>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((r) => (
                <tr key={r.id}>
                  <TdX>{fmtStamp(iso(r.startedAt))}</TdX>
                  <TdX>{r.trigger}</TdX>
                  <TdX>{r.eligibleCount ?? "—"}</TdX>
                  <TdX>{r.weekGroups ?? "—"}</TdX>
                  <TdX className={r.cfbdRequests === 0 ? "text-primary" : "text-foreground"}>
                    {r.cfbdRequests ?? "—"}
                  </TdX>
                  <TdX>{r.gradedCount ?? "—"}</TdX>
                  <TdX className="max-w-[280px] text-muted-foreground">{r.reason ?? r.error ?? "—"}</TdX>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ------------------------------ Publish --------------------------------- */

function PublishPanel({
  publishable,
  disabled,
  onPublish,
}: {
  publishable: PublishableGame[]
  disabled: boolean
  onPublish: (gameId: string, market: PublishableGame["options"][number]["market"], pickSide: PublishableGame["options"][number]["pickSide"], label: string) => void
}) {
  const [gameId, setGameId] = useState<string>(publishable[0]?.gameId ?? "")
  const game = useMemo(() => publishable.find((g) => g.gameId === gameId), [publishable, gameId])
  const [optionIdx, setOptionIdx] = useState<number>(0)

  if (publishable.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="font-display text-lg font-bold text-foreground">Publish Official Pick</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          No publishable games. Every matched game may already have picks, or kickoff has passed. Run
          an odds refresh below to load upcoming lines.
        </p>
      </div>
    )
  }

  const option = game?.options[optionIdx]

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="font-display text-lg font-bold text-foreground">Publish Official Pick</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Freezes the pick from the current server snapshot — line, price, and book are recorded exactly
        as shown and locked before kickoff. The line and hash are derived server-side; this form only
        selects the game and side.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Game</span>
          <select
            value={gameId}
            onChange={(e) => {
              setGameId(e.target.value)
              setOptionIdx(0)
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {publishable.map((g) => (
              <option key={g.gameId} value={g.gameId}>
                {g.matchup} — {fmtStamp(g.kickoffIso)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Pick</span>
          <select
            value={optionIdx}
            onChange={(e) => setOptionIdx(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {game?.options.map((o, i) => (
              <option key={`${o.market}-${o.pickSide}`} value={i}>
                {o.label} ({formatAmerican(o.priceAmerican)}) · {o.market}
              </option>
            ))}
          </select>
        </label>
      </div>

      {option && game && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3">
          <div className="font-mono text-xs text-muted-foreground">
            Freezing <span className="text-foreground">{option.label}</span> @{" "}
            <span className="text-foreground">{formatAmerican(option.priceAmerican)}</span> ·{" "}
            {game.book} · locks at kickoff {fmtStamp(game.kickoffIso)}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPublish(game.gameId, option.market, option.pickSide, option.label)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disabled ? "Working…" : "Publish & Lock"}
          </button>
        </div>
      )}
    </div>
  )
}

/* ---------------------------- Published list ---------------------------- */

function PublishedList({
  predictions,
  disabled,
  onCorrect,
}: {
  predictions: PredictionView[]
  disabled: boolean
  onCorrect: (input: {
    predictionId: string
    field: string
    originalValue: string | null
    correctedValue: string | null
    reason: string
  }) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="font-display text-lg font-bold text-foreground">
        Published Picks ({predictions.length})
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Corrections are append-only: the original value stays on the public record and the pick is
        flagged “Corrected”. Grades and frozen values are never edited here.
      </p>

      {predictions.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No official picks published yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {predictions.map((p) => (
            <div key={p.id} className="rounded-md border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">{p.matchup}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{p.pickLabel}</span> (
                    {formatAmerican(p.priceAmerican)}) · {p.marketLabel} · {p.book}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    lock {p.lockHashShort}… · {p.modelIsPlaceholder ? "manual (pre-model)" : p.modelVersion}
                    {p.hasCorrection ? " · corrected" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <StatusPill status={p.status} grade={p.grade} />
                  {p.status === "graded" && (
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {p.scoreLabel} · {formatUnits(p.unitsDelta)}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === p.id ? null : p.id)}
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  {openId === p.id ? "Cancel correction" : "Add correction"}
                </button>
              </div>

              {openId === p.id && (
                <CorrectionForm
                  disabled={disabled}
                  onSubmit={(field, originalValue, correctedValue, reason) => {
                    onCorrect({ predictionId: p.id, field, originalValue, correctedValue, reason })
                    setOpenId(null)
                  }}
                />
              )}

              {p.corrections.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {p.corrections.map((c, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className="font-semibold text-amber-500">{c.field}</span>: {c.originalValue ?? "—"} →{" "}
                      {c.correctedValue ?? "—"} — {c.reason}{" "}
                      <span className="text-muted-foreground/70">({fmtStamp(c.createdAtIso)})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CorrectionForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean
  onSubmit: (field: string, originalValue: string | null, correctedValue: string | null, reason: string) => void
}) {
  const [field, setField] = useState("pickLabel")
  const [originalValue, setOriginalValue] = useState("")
  const [correctedValue, setCorrectedValue] = useState("")
  const [reason, setReason] = useState("")

  return (
    <div className="mt-3 grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Field</span>
        <input
          value={field}
          onChange={(e) => setField(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Reason (required)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. typo in displayed team name"
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Original value</span>
        <input
          value={originalValue}
          onChange={(e) => setOriginalValue(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Corrected value</span>
        <input
          value={correctedValue}
          onChange={(e) => setCorrectedValue(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="button"
          disabled={disabled || !reason.trim()}
          onClick={() => onSubmit(field.trim(), originalValue || null, correctedValue || null, reason.trim())}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          Record correction
        </button>
      </div>
    </div>
  )
}

/* ------------------------------- helpers -------------------------------- */

function StatusPill({ status, grade }: { status: string; grade: string | null }) {
  if (status !== "graded" || !grade) {
    return (
      <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Locked
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

function iso(d: Date | string | null): string {
  if (!d) return ""
  return d instanceof Date ? d.toISOString() : String(d)
}

function fmtStamp(isoStr: string): string {
  const d = new Date(isoStr)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function ThX({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 font-normal">{children}</th>
}
function TdX({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-foreground ${className}`}>{children}</td>
}
