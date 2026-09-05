"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Plus, X, SlidersHorizontal, RotateCcw, Info, Zap, Lock, Search } from "lucide-react"
import {
  useLiveBoard,
  formatKickoff,
  formatKickoffDate,
  type LiveBoardGame,
} from "@/lib/use-live-board"
import { TeamName } from "@/components/team-name"
import { TeamLogo } from "@/components/team-logo"
import { getTeamColor } from "@/lib/bse"
import { CurrentWeekSlate } from "@/components/parlay/current-week-slate"
import { useAccess } from "@/lib/use-access"
import { useToolUsage } from "@/lib/use-tool-usage"
import { ToolGate, toolGateMode } from "@/components/parlay/tool-gate"
import { runAnalyzer } from "@/app/actions/tools"
import type { AnalyzerLegInput, AnalyzerResult, AnalyzerLegResult } from "@/lib/tools/types"
import {
  CLASSIFICATION_COPY,
  LINE_SOURCE_COPY,
  type BetSide,
  type BetClassification,
} from "@/lib/bse/price-aware"

/**
 * Interactive PRICE-AWARE Parlay Analyzer.
 *
 * Build a ticket freely (each leg is a real DraftKings spread + price, or an
 * alternate you type from your own slip). Pressing "Analyze ticket" sends the
 * selection to the server, which re-grades every leg with the SAME frozen model
 * (never trusting a client value), captures each game's canonical BSE Rating
 * into the Postgame Review dataset, and returns the authoritative graded read
 * shown below. No EV or win probability is ever produced — see price-aware.
 *
 * Gating: guests are prompted to create a free account; free (Rookie) accounts
 * get a limited number of analyses per week (server-enforced, refresh-proof);
 * BSE Pro is unlimited. The graded breakdown is revealed only after a
 * successful, allowance-consuming analyze.
 */

interface Leg {
  key: string
  gameId: string
  side: BetSide
  altHomeSpread: number | null
  altPrice: number | null
}

/* ------------------------------- formatting ------------------------------- */

function fmtSpread(n: number | null): string {
  if (n == null) return "—"
  if (n === 0) return "PK"
  return n > 0 ? `+${n}` : `${n}`
}
function fmtPrice(n: number | null): string {
  if (n == null) return "—"
  return n > 0 ? `+${n}` : `${n}`
}
function fmtEdge(n: number | null): string {
  if (n == null) return "—"
  const s = n > 0 ? "+" : ""
  return `${s}${n.toFixed(1)}`
}

function mainPriceFor(game: LiveBoardGame, side: BetSide): number | null {
  const p = game.marketSpreadPrice
  if (!p) return null
  return side === "home" ? p.home : p.away
}
function pickedSpreadFor(homeSpread: number | null, side: BetSide): number | null {
  if (homeSpread == null) return null
  return side === "home" ? homeSpread : -homeSpread
}

const BADGE_STYLE: Record<BetClassification, string> = {
  STRONG_LINE_PRICE_OK: "border-[var(--rating-strong)]/40 bg-[var(--rating-strong)]/10 text-[var(--rating-strong)]",
  GOOD_LINE_EXPENSIVE: "border-[var(--rating-mid)]/40 bg-[var(--rating-mid)]/10 text-[var(--rating-mid)]",
  NO_EDGE: "border-border bg-secondary/50 text-muted-foreground",
  INSUFFICIENT_DATA: "border-border bg-secondary/50 text-muted-foreground",
}

/** Stable signature of the current ticket selection (for stale-reveal detection). */
function legsSignature(legs: Leg[]): string {
  return legs
    .map((l) => `${l.gameId}:${l.side}:${l.altHomeSpread ?? "m"}:${l.altPrice ?? "m"}`)
    .join("|")
}

/* ================================ component =============================== */

export function InteractiveAnalyzer() {
  const { games, week, projectionsAvailable, loading, error } = useLiveBoard()
  const access = useAccess()
  const usage = useToolUsage()

  const [legs, setLegs] = useState<Leg[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [analysis, setAnalysis] = useState<AnalyzerResult | null>(null)
  const [ticketNumber, setTicketNumber] = useState<number | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const gamesById = useMemo(() => {
    const m = new Map<string, LiveBoardGame>()
    for (const g of games) m.set(g.id, g)
    return m
  }, [games])

  const usedGameIds = useMemo(() => new Set(legs.map((l) => l.gameId)), [legs])
  const signature = legsSignature(legs)

  // A graded reveal is only valid for the exact ticket it was produced from.
  // Any edit to the selection invalidates it — the user must analyze again.
  const analyzedSigRef = useRef<string | null>(null)
  useEffect(() => {
    if (analyzedSigRef.current !== null && analyzedSigRef.current !== signature) {
      setAnalysis(null)
      setTicketNumber(null)
      setRunError(null)
      analyzedSigRef.current = null
    }
  }, [signature])

  function addLeg(gameId: string, side: BetSide) {
    setLegs((prev) => [...prev, { key: `${gameId}:${Date.now()}`, gameId, side, altHomeSpread: null, altPrice: null }])
    setPickerOpen(false)
  }
  function removeLeg(key: string) {
    setLegs((prev) => prev.filter((l) => l.key !== key))
  }
  function setAlt(key: string, altHomeSpread: number | null, altPrice: number | null) {
    setLegs((prev) => prev.map((l) => (l.key === key ? { ...l, altHomeSpread, altPrice } : l)))
  }

  // Deep-link preselection from Getting Parlaid's "Analyze an alternate" CTA.
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current || loading || games.length === 0) return
    seededRef.current = true
    const params = new URLSearchParams(window.location.search)
    const gameId = params.get("game")
    if (!gameId || !games.some((g) => g.id === gameId)) return
    const side: BetSide = params.get("side") === "away" ? "away" : "home"
    setLegs((prev) =>
      prev.some((l) => l.gameId === gameId)
        ? prev
        : [...prev, { key: `${gameId}:${Date.now()}`, gameId, side, altHomeSpread: null, altPrice: null }],
    )
  }, [loading, games])

  const usageInfo = usage.data?.usage?.analyzer ?? null
  const lastTicket = usage.data?.lastAnalyzer ?? null
  const gateMode = toolGateMode({
    loading: access.loading || usage.loading,
    isGuest: access.isGuest,
    isPro: access.isPro,
    usage: usageInfo,
  })

  function analyze() {
    setRunError(null)
    const payload: AnalyzerLegInput[] = legs.map((l) => ({
      gameId: l.gameId,
      side: l.side,
      altHomeSpread: l.altHomeSpread,
      altPrice: l.altPrice,
    }))
    const sig = signature
    startTransition(async () => {
      const res = await runAnalyzer(payload)
      if (res.status === "ok") {
        setAnalysis(res.result)
        setTicketNumber(res.ticketNumber)
        analyzedSigRef.current = sig
        usage.setUsage(res.usage)
      } else if (res.status === "locked") {
        usage.setUsage(res.usage)
        await usage.refresh()
      } else if (res.status === "auth") {
        await access.refresh()
      } else {
        setRunError(res.error)
      }
    })
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-secondary/40" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm text-destructive">
        {`Unable to load this week's board: ${error}`}
      </p>
    )
  }

  if (!projectionsAvailable) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-5">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="size-5" />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-foreground">
              Grading activates when this week&apos;s BSE spread reads publish
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              The analyzer grades each spread leg against the BSE model&apos;s fair spread and the DraftKings price.
              Those reads aren&apos;t out for the current board yet, so we won&apos;t show fabricated edges. Below is the
              real current-week slate it will grade the moment the model runs.
            </p>
          </div>
        </div>
        <CurrentWeekSlate />
      </div>
    )
  }

  const addable = games.filter((g) => !usedGameIds.has(g.id))
  const canAnalyze = legs.length > 0 && !pending

  return (
    <div className="space-y-4">
      {/* Ticket builder */}
      {legs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-8 text-center">
          <p className="font-display text-base font-semibold text-foreground">Build your ticket</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Add spread legs, then press <strong className="text-foreground">Analyze ticket</strong>. BSE grades each leg
            two ways — how the number compares to its fair line, and whether the DraftKings price is worth paying.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {legs.map((leg) => (
            <BuildLegCard
              key={leg.key}
              leg={leg}
              game={gamesById.get(leg.gameId)}
              onRemove={() => removeLeg(leg.key)}
              onSetAlt={(s, p) => setAlt(leg.key, s, p)}
            />
          ))}
        </ul>
      )}

      {/* Add-leg control */}
      <div>
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary/15"
          aria-expanded={pickerOpen}
        >
          <Plus className="size-4" />
          Add a spread leg
        </button>
        {pickerOpen && (
          <GamePicker games={addable} week={week} onPick={addLeg} onClose={() => setPickerOpen(false)} />
        )}
      </div>

      {/* Gate + Analyze */}
      {legs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <ToolGate mode={gateMode} usage={usageInfo} isPro={access.isPro} labels={{ singular: "analysis", plural: "analyses" }}>
            <button
              type="button"
              onClick={analyze}
              disabled={!canAnalyze}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 font-display text-base font-semibold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Zap className="size-4" />
              {pending ? "Analyzing…" : "Analyze ticket"}
            </button>
          </ToolGate>
          {runError && <p className="mt-2 text-center text-xs text-destructive">{runError}</p>}
        </div>
      )}

      {/* At-limit: re-show last analyzed ticket read-only under the lock. */}
      {gateMode === "locked" && !analysis && lastTicket?.payload != null && (
        <RevealedTicket
          result={lastTicket.payload as AnalyzerResult}
          ticketNumber={null}
          title="Your last analyzed ticket"
          readOnly
        />
      )}

      {/* Successful reveal: server-authoritative graded breakdown. */}
      {analysis && (
        <RevealedTicket result={analysis} ticketNumber={ticketNumber} title="Graded ticket" />
      )}
    </div>
  )
}

/* ------------------------------ build leg card ----------------------------- */

function BuildLegCard({
  leg,
  game,
  onRemove,
  onSetAlt,
}: {
  leg: Leg
  game: LiveBoardGame | undefined
  onRemove: () => void
  onSetAlt: (altHomeSpread: number | null, altPrice: number | null) => void
}) {
  const [editing, setEditing] = useState(false)

  if (!game) {
    return (
      <li className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-sm text-muted-foreground">This game is no longer on the board.</span>
        <button type="button" onClick={onRemove} aria-label="Remove leg" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </li>
    )
  }

  const side = leg.side
  const pickedTeam = side === "home" ? game.home : game.away
  const teamColor = getTeamColor(pickedTeam.name)
  const usingAlt = leg.altHomeSpread != null || leg.altPrice != null
  const offeredHomeSpread = leg.altHomeSpread ?? game.marketSpread
  const pickedSpread = pickedSpreadFor(offeredHomeSpread, side)
  const price = leg.altPrice ?? mainPriceFor(game, side)
  const source = LINE_SOURCE_COPY[usingAlt ? "USER_ENTERED" : "LIVE_DK"]

  return (
    <li
      style={{ borderLeftColor: teamColor, borderLeftWidth: 3 }}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            <span>{formatKickoffDate(game.kickoff)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatKickoff(game.kickoff, game.kickoffTBD)}</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <TeamName name={pickedTeam.name} abbr={pickedTeam.abbr} size="sm" />
            <span className="font-display text-lg font-bold tabular-nums text-foreground">{fmtSpread(pickedSpread)}</span>
            {price != null && <span className="font-mono text-xs text-muted-foreground">{fmtPrice(price)}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {side === "home" ? `vs ${game.away.abbr}` : `@ ${game.home.abbr}`}
            </p>
            <span
              title={source.long}
              className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
                usingAlt
                  ? "border-[var(--rating-mid)]/50 bg-[var(--rating-mid)]/10 text-[var(--rating-mid)]"
                  : "border-[var(--rating-strong)]/40 bg-[var(--rating-strong)]/10 text-[var(--rating-strong)]"
              }`}
            >
              {source.label}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove leg"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Alternate line entry (real DK number, graded on Analyze) */}
      <div className="border-t border-border px-4 py-2.5">
        {!editing ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              <SlidersHorizontal className="size-3.5" />
              {usingAlt ? "Edit alternate line" : "Enter your DraftKings alternate"}
            </button>
            {usingAlt && (
              <button
                type="button"
                onClick={() => onSetAlt(null, null)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                Reset to DK main
              </button>
            )}
          </div>
        ) : (
          <AltLineEditor
            side={side}
            homeAbbr={game.home.abbr}
            awayAbbr={game.away.abbr}
            currentPickedSpread={pickedSpread}
            currentPrice={price}
            onCancel={() => setEditing(false)}
            onApply={(pickedSpreadInput, priceInput) => {
              const altHome = pickedSpreadInput == null ? null : side === "home" ? pickedSpreadInput : -pickedSpreadInput
              onSetAlt(altHome, priceInput)
              setEditing(false)
            }}
          />
        )}
      </div>
    </li>
  )
}

/* ---------------------------- revealed graded ticket ---------------------- */

function RevealedTicket({
  result,
  ticketNumber,
  title,
  readOnly = false,
}: {
  result: AnalyzerResult
  ticketNumber: number | null
  title: string
  readOnly?: boolean
}) {
  const s = result.summary
  const tone = s.allStrong
    ? "border-[var(--rating-strong)]/40 bg-[var(--rating-strong)]/5"
    : s.insufficient > 0 || s.noEdge > 0
      ? "border-border bg-card"
      : "border-[var(--rating-mid)]/40 bg-[var(--rating-mid)]/5"

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          {readOnly && <Lock className="size-3.5 text-muted-foreground" />}
          {title}
        </h3>
        {ticketNumber != null && (
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            #{String(ticketNumber).padStart(3, "0")} · saved
          </span>
        )}
      </div>

      <ul className="space-y-3">
        {result.legs.map((leg) => (
          <RevealedLegCard key={leg.gameId} leg={leg} />
        ))}
      </ul>

      {/* Ticket-level read (from the server summary — no EV / win-prob) */}
      <div className={`rounded-xl border ${tone} p-4`}>
        <div className="flex items-center justify-between">
          <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">Ticket read</h4>
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {s.legCount} leg{s.legCount === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground text-pretty">{s.verdict}</p>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat label="Strong" value={s.strong} tone="good" />
          <SummaryStat label="Expensive" value={s.expensive} tone={s.expensive ? "mid" : "neutral"} />
          <SummaryStat label="No edge" value={s.noEdge} tone={s.noEdge ? "bad" : "neutral"} />
          <SummaryStat label="Total line edge" value={`${fmtEdge(s.totalLineEdge)} pt`} tone="neutral" />
        </div>

        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-3">
          <div className="flex flex-col">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Combined price</span>
            <span className="font-display text-lg font-bold tabular-nums text-foreground">
              {result.combinedAmerican != null ? fmtPrice(result.combinedAmerican) : "—"}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {result.combinedAmerican != null ? "DK parlay juice — not EV" : "needs a price on every leg"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Strongest leg</span>
            <span className="font-display text-sm font-semibold text-[var(--rating-strong)]">
              {result.strongestLabel ?? "—"}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {result.strongestLabel ? "" : "add 2+ legs"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Hurting most</span>
            <span className="font-display text-sm font-semibold text-foreground">{result.weakestLabel ?? "—"}</span>
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {result.weakestLabel ? "" : "add 2+ legs"}
            </span>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-1.5 border-t border-border pt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          <span>
            BSE grades line value and price only. It does <strong className="text-foreground">not</strong> compute a
            parlay win probability or expected value — no validated point-to-cover calibration exists yet, so none is
            shown.
          </span>
        </p>
      </div>
    </div>
  )
}

function RevealedLegCard({ leg }: { leg: AnalyzerLegResult }) {
  const copy = CLASSIFICATION_COPY[leg.classification]
  const breakevenPct = leg.impliedBreakeven != null ? `${(leg.impliedBreakeven * 100).toFixed(1)}%` : "—"
  const source = LINE_SOURCE_COPY[leg.usingAlt ? "USER_ENTERED" : "LIVE_DK"]

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-display text-base font-semibold text-foreground">{leg.pickLabel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground">{leg.matchup}</p>
            <span
              title={source.long}
              className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
                leg.usingAlt
                  ? "border-[var(--rating-mid)]/50 bg-[var(--rating-mid)]/10 text-[var(--rating-mid)]"
                  : "border-[var(--rating-strong)]/40 bg-[var(--rating-strong)]/10 text-[var(--rating-strong)]"
              }`}
            >
              {source.label}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">BSE rating</span>
          <p className="font-display text-lg font-bold tabular-nums text-foreground">
            {leg.bseRating != null ? Math.round(leg.bseRating) : "—"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4">
        <Metric label={leg.usingAlt ? "Your line" : "DK line"} value={fmtSpread(leg.pickedSpread)} />
        <Metric label="DK price" value={fmtPrice(leg.price)} />
        <Metric
          label="BSE fair"
          value={fmtSpread(leg.fairPicked != null ? Math.round(leg.fairPicked * 10) / 10 : null)}
        />
        <Metric
          label="Line edge"
          value={`${fmtEdge(leg.lineEdge)} pt`}
          tone={leg.lineEdge != null && leg.lineEdge >= 1 ? "good" : leg.lineEdge != null && leg.lineEdge < 0 ? "bad" : "neutral"}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className={`inline-flex items-center rounded-md border px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide ${BADGE_STYLE[leg.classification]}`}>
            {copy.label}
          </span>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{copy.blurb}</p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Price breakeven</p>
          <p className="font-display text-sm font-semibold tabular-nums text-foreground">
            {breakevenPct}
            <span className="ml-1 font-mono text-[10px] uppercase text-muted-foreground">{leg.priceTier}</span>
          </p>
        </div>
      </div>
    </li>
  )
}

/* --------------------------------- shared UI ------------------------------ */

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  const toneClass =
    tone === "good" ? "text-[var(--rating-strong)]" : tone === "bad" ? "text-destructive" : "text-foreground"
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-display text-base font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  )
}

function SummaryStat({ label, value, tone }: { label: string; value: number | string; tone: "good" | "mid" | "bad" | "neutral" }) {
  const toneClass =
    tone === "good"
      ? "text-[var(--rating-strong)]"
      : tone === "mid"
        ? "text-[var(--rating-mid)]"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground"
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-display text-xl font-bold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  )
}

/* ------------------------------- alt editor -------------------------------- */

function AltLineEditor({
  side,
  homeAbbr,
  awayAbbr,
  currentPickedSpread,
  currentPrice,
  onApply,
  onCancel,
}: {
  side: BetSide
  homeAbbr: string
  awayAbbr: string
  currentPickedSpread: number | null
  currentPrice: number | null
  onApply: (pickedSpread: number | null, price: number | null) => void
  onCancel: () => void
}) {
  const [spreadStr, setSpreadStr] = useState(currentPickedSpread != null ? String(currentPickedSpread) : "")
  const [priceStr, setPriceStr] = useState(currentPrice != null ? String(currentPrice) : "")

  const teamAbbr = side === "home" ? homeAbbr : awayAbbr

  function parseNum(str: string): number | null {
    const t = str.trim().replace(/^\+/, "")
    if (t === "" || t === "-") return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  return (
    <div className="space-y-3 py-1">
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Type the exact <strong className="text-foreground">{teamAbbr}</strong> spread and American price shown on your
          DraftKings slip. BSE grades that real number — it doesn&apos;t invent alternate prices.
        </span>
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">{teamAbbr} spread</span>
          <input
            inputMode="decimal"
            value={spreadStr}
            onChange={(e) => setSpreadStr(e.target.value)}
            placeholder="-7"
            className="h-11 w-24 rounded-md border border-input bg-background px-3 text-base tabular-nums text-foreground outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">American price</span>
          <input
            inputMode="numeric"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            placeholder="-110"
            className="h-11 w-28 rounded-md border border-input bg-background px-3 text-base tabular-nums text-foreground outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40"
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onApply(parseNum(spreadStr), parseNum(priceStr))}
            className="inline-flex h-11 items-center rounded-md bg-primary px-4 font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
          >
            Use this line
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center rounded-md border border-border px-3 font-mono text-[11px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------- game picker ------------------------------- */

function GamePicker({
  games,
  week,
  onPick,
  onClose,
}: {
  games: LiveBoardGame[]
  week: number | null
  onPick: (gameId: string, side: BetSide) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(
    () => [...games].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()),
    [games],
  )

  // Filter by either team's full name or abbreviation so users can jump
  // straight to their team instead of scrolling the whole slate.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((g) =>
      [g.home.name, g.home.abbr, g.away.name, g.away.abbr].some((s) => s.toLowerCase().includes(q)),
    )
  }, [rows, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-foreground">
          {week ? `Week ${week} — pick a side` : "Pick a side"}
        </span>
        <button type="button" onClick={onClose} aria-label="Close picker" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {/* Team search — filter the slate down to a team fast */}
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your team (e.g. Georgia, OSU, Oregon)"
            className="min-h-11 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Search games by team"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("")
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Every game on the board is already on your ticket.</p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">{`No games match “${query.trim()}.” Try a school name or abbreviation.`}</p>
      ) : (
        <ul className="max-h-96 divide-y divide-border overflow-y-auto scrollbar-none">
          {filtered.map((g) => (
            <PickerRow key={g.id} game={g} onPick={onPick} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PickerRow({ game, onPick }: { game: LiveBoardGame; onPick: (gameId: string, side: BetSide) => void }) {
  const homeSpread = game.marketSpread
  const awaySpread = homeSpread != null ? -homeSpread : null
  const graded = game.fairSpread != null

  return (
    <li className="px-4 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          {formatKickoffDate(game.kickoff)} · {formatKickoff(game.kickoff, game.kickoffTBD)}
        </span>
        {!graded && (
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
            No BSE grade
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SideButton disabled={homeSpread == null} onClick={() => onPick(game.id, "away")} team={game.away} spread={awaySpread} />
        <SideButton disabled={homeSpread == null} onClick={() => onPick(game.id, "home")} team={game.home} spread={homeSpread} />
      </div>
    </li>
  )
}

function SideButton({
  team,
  spread,
  disabled,
  onClick,
}: {
  team: { name: string; abbr: string }
  spread: number | null
  disabled: boolean
  onClick: () => void
}) {
  const color = getTeamColor(team.name)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
      className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex min-w-0 items-center gap-2">
        <TeamLogo name={team.name} abbr={team.abbr} size="sm" />
        <span className="min-w-0 truncate font-display text-sm font-semibold text-foreground">{team.abbr}</span>
      </span>
      <span className="font-display text-sm font-bold tabular-nums text-foreground">{fmtSpread(spread)}</span>
    </button>
  )
}
