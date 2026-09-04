"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, X, SlidersHorizontal, RotateCcw, Info } from "lucide-react"
import {
  useLiveBoard,
  formatKickoff,
  formatKickoffDate,
  type LiveBoardGame,
} from "@/lib/use-live-board"
import { TeamName } from "@/components/team-name"
import { CurrentWeekSlate } from "@/components/parlay/current-week-slate"
import { SaveForGrading, type SavableLeg } from "@/components/parlay/save-for-grading"
import {
  evaluateBet,
  summarizeParlay,
  assessPointsPurchase,
  combineAmericanPrices,
  CLASSIFICATION_COPY,
  LINE_SOURCE_COPY,
  type BetSide,
  type BetClassification,
  type BetEvaluation,
} from "@/lib/bse/price-aware"

/**
 * Interactive PRICE-AWARE Parlay Analyzer.
 *
 * Every number shown comes from real data: the frozen model's fair line
 * (game.fairSpread, home-relative) and DraftKings' real main-line spread +
 * American price (game.marketSpread / game.marketSpreadPrice). Because we only
 * ingest the DK MAIN line (the SGO client does not pull alternate rungs), the
 * user can type in the exact alternate spread + price they see on their own
 * DraftKings slip; BSE then grades that REAL number instead of a fabricated
 * one. No EV or win-probability is ever shown — see lib/bse/price-aware.
 */

interface Leg {
  key: string
  gameId: string
  side: BetSide
  /** Alternate home-relative spread the user entered; null = DK main line. */
  altHomeSpread: number | null
  /** Alternate American price the user entered; null = DK main-line price. */
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

/** DK price for the chosen side of a game's main spread. */
function mainPriceFor(game: LiveBoardGame, side: BetSide): number | null {
  const p = game.marketSpreadPrice
  if (!p) return null
  return side === "home" ? p.home : p.away
}
/** Team-facing spread from a home-relative number for the chosen side. */
function pickedSpreadFor(homeSpread: number | null, side: BetSide): number | null {
  if (homeSpread == null) return null
  return side === "home" ? homeSpread : -homeSpread
}

/** A leg identified as the ticket's best or worst, for the parlay-level read. */
interface LegPoint {
  label: string
  classification: BetClassification
  lineEdge: number | null
  detail: string
}

const CLASS_RANK: Record<BetClassification, number> = {
  STRONG_LINE_PRICE_OK: 3,
  GOOD_LINE_EXPENSIVE: 2,
  NO_EDGE: 1,
  INSUFFICIENT_DATA: 0,
}

interface EvaluatedLeg {
  leg: Leg
  game: LiveBoardGame | undefined
  evaluation: BetEvaluation
  usingAlt: boolean
}

/**
 * Identify the strongest and weakest legs (which leg helps / hurts the ticket
 * most) from real per-leg classifications and line edges. No EV/win-prob.
 */
function analyzeLegs(evaluated: EvaluatedLeg[]): { weakest: LegPoint | null; strongest: LegPoint | null } {
  const points: LegPoint[] = evaluated.map((e) => {
    const abbr = e.game ? (e.leg.side === "home" ? e.game.home.abbr : e.game.away.abbr) : "—"
    return {
      label: `${abbr} ${fmtSpread(e.evaluation.pickedSpread)}`,
      classification: e.evaluation.classification,
      lineEdge: e.evaluation.lineEdge,
      detail: CLASSIFICATION_COPY[e.evaluation.classification].label,
    }
  })
  if (points.length < 2) return { weakest: null, strongest: null }

  const byWorst = [...points].sort(
    (a, b) => CLASS_RANK[a.classification] - CLASS_RANK[b.classification] || (a.lineEdge ?? 0) - (b.lineEdge ?? 0),
  )
  const byBest = [...points].sort(
    (a, b) => CLASS_RANK[b.classification] - CLASS_RANK[a.classification] || (b.lineEdge ?? 0) - (a.lineEdge ?? 0),
  )
  return { weakest: byWorst[0] ?? null, strongest: byBest[0] ?? null }
}

const BADGE_STYLE: Record<BetClassification, string> = {
  STRONG_LINE_PRICE_OK: "border-[var(--rating-strong)]/40 bg-[var(--rating-strong)]/10 text-[var(--rating-strong)]",
  GOOD_LINE_EXPENSIVE: "border-[var(--rating-mid)]/40 bg-[var(--rating-mid)]/10 text-[var(--rating-mid)]",
  NO_EDGE: "border-border bg-secondary/50 text-muted-foreground",
  INSUFFICIENT_DATA: "border-border bg-secondary/50 text-muted-foreground",
}

/* ================================ component =============================== */

export function InteractiveAnalyzer() {
  const { games, week, projectionsAvailable, loading, error } = useLiveBoard()
  const [legs, setLegs] = useState<Leg[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  const gamesById = useMemo(() => {
    const m = new Map<string, LiveBoardGame>()
    for (const g of games) m.set(g.id, g)
    return m
  }, [games])

  const usedGameIds = useMemo(() => new Set(legs.map((l) => l.gameId)), [legs])

  function addLeg(gameId: string, side: BetSide) {
    setLegs((prev) => [
      ...prev,
      { key: `${gameId}:${Date.now()}`, gameId, side, altHomeSpread: null, altPrice: null },
    ])
    setPickerOpen(false)
  }
  function removeLeg(key: string) {
    setLegs((prev) => prev.filter((l) => l.key !== key))
  }
  function setAlt(key: string, altHomeSpread: number | null, altPrice: number | null) {
    setLegs((prev) => prev.map((l) => (l.key === key ? { ...l, altHomeSpread, altPrice } : l)))
  }

  // Deep-link preselection: Getting Parlaid's "Analyze an alternate" CTA links
  // here with ?game=<id>&side=<home|away>. Seed that exact leg once the board
  // loads so the user can immediately type the DK alternate they see. Read from
  // the URL directly (client-only) to avoid a Suspense boundary requirement.
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

  // Evaluate every leg against the frozen fair line + its (main or alt) price.
  const evaluated = legs.map((leg) => {
    const game = gamesById.get(leg.gameId)
    const fairHomeSpread = game?.fairSpread ?? null
    const mainHomeSpread = game?.marketSpread ?? null
    const offeredHomeSpread = leg.altHomeSpread ?? mainHomeSpread
    const price = leg.altPrice ?? (game ? mainPriceFor(game, leg.side) : null)
    const evaluation = evaluateBet({ fairHomeSpread, offeredHomeSpread, price, side: leg.side })
    const usingAlt = leg.altHomeSpread != null || leg.altPrice != null
    return { leg, game, evaluation, usingAlt }
  })

  const summary = summarizeParlay(
    evaluated.map((e) => ({ classification: e.evaluation.classification, lineEdge: e.evaluation.lineEdge })),
  )

  // Parlay-level readout (no EV/win-prob): real combined price when every leg
  // has a price, plus which leg helps and hurts the ticket most.
  const combined = combineAmericanPrices(evaluated.map((e) => e.evaluation.price))
  const legAnalysis = analyzeLegs(evaluated)

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

  // Honest pending state: no fabricated grades until the model publishes.
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
              The analyzer grades each spread leg against the BSE model&apos;s fair spread and the
              DraftKings price. Those reads aren&apos;t out for the current board yet, so we won&apos;t
              show fabricated edges. Below is the real current-week slate it will grade the moment the
              model runs.
            </p>
          </div>
        </div>
        <CurrentWeekSlate />
      </div>
    )
  }

  const addable = games.filter((g) => !usedGameIds.has(g.id))

  return (
    <div className="space-y-4">
      {/* Ticket */}
      {legs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-8 text-center">
          <p className="font-display text-base font-semibold text-foreground">Build your ticket</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Add a spread leg and BSE grades it two ways — how the number compares to its fair line,
            and whether the DraftKings price is worth paying.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {evaluated.map(({ leg, game, evaluation, usingAlt }) => (
            <LegCard
              key={leg.key}
              leg={leg}
              game={game}
              evaluation={evaluation}
              usingAlt={usingAlt}
              onRemove={() => removeLeg(leg.key)}
              onSetAlt={(s, p) => setAlt(leg.key, s, p)}
              projectionsAvailable={projectionsAvailable}
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

      {/* Ticket summary */}
      {legs.length > 0 && (
        <TicketSummary
          summary={summary}
          combinedAmerican={combined?.american ?? null}
          weakest={legAnalysis.weakest}
          strongest={legAnalysis.strongest}
        />
      )}

      {/* Admin-only: snapshot this ticket into the Postgame Review dataset.
          Self-hides for non-admins; legs save as unrated (no numeric rating). */}
      {legs.length > 0 && (
        <SaveForGrading
          legs={buildSavableLegs(evaluated)}
          season={games[0]?.season ?? new Date().getFullYear()}
          week={week ?? games[0]?.week ?? 1}
          combinedAmerican={combined?.american ?? null}
        />
      )}
    </div>
  )
}

/**
 * Map evaluated analyzer legs into the frozen Postgame Review shape. Only legs
 * whose game resolved (so a CFBD id exists for grading) are included. The line
 * saved is the REAL number the leg was graded against (alt when the user typed
 * one, else the DK main line), team-facing to match the pick side.
 */
function buildSavableLegs(evaluated: EvaluatedLeg[]): SavableLeg[] {
  const out: SavableLeg[] = []
  for (const e of evaluated) {
    if (!e.game) continue
    const teamName = e.leg.side === "home" ? e.game.home.name : e.game.away.name
    out.push({
      gameId: e.game.id, // already `cfbd-<id>`
      season: e.game.season,
      week: e.game.week,
      kickoffIso: e.game.kickoffTBD ? null : e.game.kickoff,
      homeTeam: e.game.home.name,
      awayTeam: e.game.away.name,
      pickSide: e.leg.side,
      pickLabel: `${teamName} ${fmtSpread(e.evaluation.pickedSpread)}`,
      lineValue: e.evaluation.pickedSpread,
      priceAmerican: e.evaluation.price,
      classification: e.evaluation.classification,
      lineEdge: e.evaluation.lineEdge,
      fairLine: e.game.fairSpread,
      altRecommendation: e.usingAlt
        ? { pickedSpread: e.evaluation.pickedSpread, price: e.evaluation.price, verdict: e.evaluation.classification, worthwhile: null }
        : null,
    })
  }
  return out
}

/* --------------------------------- leg card -------------------------------- */

function LegCard({
  leg,
  game,
  evaluation,
  usingAlt,
  onRemove,
  onSetAlt,
  projectionsAvailable,
}: {
  leg: Leg
  game: LiveBoardGame | undefined
  evaluation: BetEvaluation
  usingAlt: boolean
  onRemove: () => void
  onSetAlt: (altHomeSpread: number | null, altPrice: number | null) => void
  projectionsAvailable: boolean
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
  const pickedSpread = pickedSpreadFor(evaluation.offeredHomeSpread, side)
  const fairPicked = pickedSpreadFor(game.fairSpread, side)
  const copy = CLASSIFICATION_COPY[evaluation.classification]
  const breakevenPct = evaluation.impliedBreakeven != null ? `${(evaluation.impliedBreakeven * 100).toFixed(1)}%` : "—"
  const source = LINE_SOURCE_COPY[usingAlt ? "USER_ENTERED" : "LIVE_DK"]

  // When the user entered an alternate, weigh it against the verified DK main
  // line: how much protection was bought vs how much extra juice it costs.
  const mainEval = usingAlt
    ? evaluateBet({
        fairHomeSpread: game.fairSpread,
        offeredHomeSpread: game.marketSpread,
        price: mainPriceFor(game, side),
        side,
      })
    : null
  const tradeoff =
    mainEval != null
      ? assessPointsPurchase(
          { pickedSpread: mainEval.pickedSpread, price: mainEval.price },
          { pickedSpread: evaluation.pickedSpread, price: evaluation.price },
        )
      : null

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      {/* header row */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            <span>{formatKickoffDate(game.kickoff)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatKickoff(game.kickoff, game.kickoffTBD)}</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <TeamName name={pickedTeam.name} abbr={pickedTeam.abbr} size="sm" />
            <span className="font-display text-lg font-bold tabular-nums text-foreground">{fmtSpread(pickedSpread)}</span>
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

      {/* metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4">
        <Metric label={usingAlt ? "Your line" : "DK line"} value={fmtSpread(pickedSpread)} />
        <Metric label="DK price" value={fmtPrice(evaluation.price)} />
        <Metric
          label="BSE fair"
          value={projectionsAvailable ? fmtSpread(fairPicked != null ? Math.round(fairPicked * 10) / 10 : null) : "—"}
        />
        <Metric
          label="Line edge"
          value={`${fmtEdge(evaluation.lineEdge)} pt`}
          tone={evaluation.lineEdge != null && evaluation.lineEdge >= 1 ? "good" : evaluation.lineEdge != null && evaluation.lineEdge < 0 ? "bad" : "neutral"}
        />
      </div>

      {/* classification + price read */}
      <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className={`inline-flex items-center rounded-md border px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide ${BADGE_STYLE[evaluation.classification]}`}>
            {copy.label}
          </span>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{copy.blurb}</p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Price breakeven</p>
          <p className="font-display text-sm font-semibold tabular-nums text-foreground">
            {breakevenPct}
            <span className="ml-1 font-mono text-[10px] uppercase text-muted-foreground">{evaluation.priceTier}</span>
          </p>
        </div>
      </div>

      {/* buy-points tradeoff vs the verified DK main line */}
      {tradeoff != null && tradeoff.pointsGained != null && (
        <div className="flex items-start gap-2 border-t border-border bg-secondary/30 px-4 py-2.5">
          <span
            className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
              tradeoff.worthwhile
                ? "bg-[var(--rating-strong)]/20 text-[var(--rating-strong)]"
                : "bg-[var(--rating-mid)]/20 text-[var(--rating-mid)]"
            }`}
            aria-hidden="true"
          >
            {tradeoff.worthwhile ? "✓" : "!"}
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              vs DK main {fmtSpread(pickedSpreadFor(game.marketSpread, side))} ({fmtPrice(mainPriceFor(game, side))})
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground text-pretty">{tradeoff.verdict}</p>
          </div>
        </div>
      )}

      {/* adjust panel */}
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
            currentPrice={evaluation.price}
            onCancel={() => setEditing(false)}
            onApply={(pickedSpreadInput, priceInput) => {
              // Convert the team-facing spread the user typed back to home-relative.
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

  function parseNum(s: string): number | null {
    const t = s.trim().replace(/^\+/, "")
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
            Grade it
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
  const rows = [...games].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())

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
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Every game on the board is already on your ticket.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-border overflow-y-auto scrollbar-none">
          {rows.map((g) => (
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
        <SideButton
          disabled={homeSpread == null}
          onClick={() => onPick(game.id, "away")}
          team={game.away}
          spread={awaySpread}
        />
        <SideButton
          disabled={homeSpread == null}
          onClick={() => onPick(game.id, "home")}
          team={game.home}
          spread={homeSpread}
        />
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
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="min-w-0 truncate font-display text-sm font-semibold text-foreground">{team.abbr}</span>
      <span className="font-display text-sm font-bold tabular-nums text-foreground">{fmtSpread(spread)}</span>
    </button>
  )
}

/* ------------------------------ ticket summary ----------------------------- */

function TicketSummary({
  summary,
  combinedAmerican,
  weakest,
  strongest,
}: {
  summary: ReturnType<typeof summarizeParlay>
  combinedAmerican: number | null
  weakest: LegPoint | null
  strongest: LegPoint | null
}) {
  const tone = summary.allStrong
    ? "border-[var(--rating-strong)]/40 bg-[var(--rating-strong)]/5"
    : summary.insufficient > 0 || summary.noEdge > 0
      ? "border-border bg-card"
      : "border-[var(--rating-mid)]/40 bg-[var(--rating-mid)]/5"

  return (
    <div className={`rounded-xl border ${tone} p-4`}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">Ticket read</h3>
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {summary.legCount} leg{summary.legCount === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-foreground text-pretty">{summary.verdict}</p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Strong" value={summary.strong} tone="good" />
        <SummaryStat label="Expensive" value={summary.expensive} tone={summary.expensive ? "mid" : "neutral"} />
        <SummaryStat label="No edge" value={summary.noEdge} tone={summary.noEdge ? "bad" : "neutral"} />
        <SummaryStat label="Total line edge" value={`${fmtEdge(summary.totalLineEdge)} pt`} tone="neutral" />
      </div>

      {/* Combined real parlay price + which leg helps / hurts most. */}
      {(combinedAmerican != null || strongest || weakest) && (
        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-3">
          <div className="flex flex-col">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Combined price</span>
            <span className="font-display text-lg font-bold tabular-nums text-foreground">
              {combinedAmerican != null ? fmtPrice(combinedAmerican) : "—"}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {combinedAmerican != null ? "DK parlay juice — not EV" : "needs a price on every leg"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Strongest leg</span>
            <span className="font-display text-sm font-semibold text-[var(--rating-strong)]">
              {strongest ? strongest.label : "—"}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {strongest ? strongest.detail : "add 2+ legs"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Hurting most</span>
            <span className="font-display text-sm font-semibold text-foreground">{weakest ? weakest.label : "—"}</span>
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {weakest ? weakest.detail : "add 2+ legs"}
            </span>
          </div>
        </div>
      )}

      <p className="mt-3 flex items-start gap-1.5 border-t border-border pt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3 shrink-0" />
        <span>
          BSE grades line value and price only. It does <strong className="text-foreground">not</strong> compute a parlay
          win probability or expected value — no validated point-to-cover calibration exists yet, so none is shown.
        </span>
      </p>
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
