"use client"

import { useMemo } from "react"
import { Dice5, Clock, Target, ShieldCheck, Rocket, type LucideIcon } from "lucide-react"
import { CurrentWeekSlate } from "@/components/parlay/current-week-slate"
import { useLiveBoard, formatKickoff, formatKickoffDate } from "@/lib/use-live-board"
import { generateAllTickets, type ProfileResult, type GameRead, type RiskProfileId } from "@/lib/parlay/generate"
import { CLASSIFICATION_COPY, LINE_SOURCE_COPY, type BetClassification } from "@/lib/bse/price-aware"

/**
 * Getting Parlaid — BSE's parlay builder.
 *
 * BSE assembles tickets from its per-game SPREAD reads — the fair spread vs the
 * book line gives a per-leg edge in points. The model does not output win
 * probability or EV, so this surface never claims them. When the frozen model
 * has published this week's reads on /api/cfbd-board, real tickets are built
 * here (see lib/parlay/generate); until then it shows the honest pending state
 * and the real slate it will draw from — it never fabricates a ticket.
 */

// Labels describe HOW BSE built the ticket, not a promise of safety.
const PROFILE_META: Record<RiskProfileId, { label: string; icon: LucideIcon; description: string }> = {
  safer: {
    label: "Highest Edge",
    icon: ShieldCheck,
    description: "Fewest legs, each the largest spread edge at a non-punitive price. Buying points doesn't make a leg 'safe'.",
  },
  balanced: {
    label: "Balanced",
    icon: Target,
    description: "Solid per-leg spread edge without over-reaching on leg count.",
  },
  longshot: {
    label: "Long Shot",
    icon: Rocket,
    description: "More legs for a bigger payout, while each still clears BSE's edge threshold.",
  },
}

const OBJECTIVE_ORDER: RiskProfileId[] = ["balanced", "safer", "longshot"]

export function ParlayGenerator() {
  const { games, projectionsAvailable, loading, error } = useLiveBoard()

  const generated = useMemo(() => generateAllTickets(games), [games])
  const byProfile = useMemo(() => {
    const m = new Map<RiskProfileId, ProfileResult>()
    for (const r of generated.results) m.set(r.profile, r)
    return m
  }, [generated])

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* What BSE optimizes for (informational — preserved) */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            <Dice5 className="size-4 text-primary" />
            What BSE optimizes for
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            {OBJECTIVE_ORDER.map((id) => {
              const meta = PROFILE_META[id]
              const label = meta.label
              return (
                <div key={id} className="rounded-lg border border-border px-4 py-3">
                  <span className="flex items-center gap-2">
                    <meta.icon className="size-4 text-primary" />
                    <span className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
                      {label}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {meta.description}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
            BSE evaluates combinations and only recommends a ticket whose legs
            each clear its spread-edge threshold and avoid stacking shared risk —
            it will decline rather than force a bet.
          </p>
        </div>
      </div>

      {/* Tickets when reads are published; honest pending state otherwise. */}
      <div className="space-y-6">
        {loading ? (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-secondary/40" />
            ))}
          </div>
        ) : error ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm text-destructive">
            {`Unable to build tickets: ${error}`}
          </p>
        ) : !projectionsAvailable ? (
          <PendingBanner />
        ) : (
          <GeneratedTickets byProfile={byProfile} candidateCount={generated.candidates.length} />
        )}

        <CurrentWeekSlate />
      </div>
    </div>
  )
}

function PendingBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-5">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Clock className="size-5" />
      </span>
      <div>
        <p className="font-display text-base font-semibold text-foreground">
          Ticket generation activates when this week&apos;s BSE spread reads publish
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Getting Parlaid builds tickets from the BSE model&apos;s ratings and spread
          edges. Those aren&apos;t out for the current board yet, so we won&apos;t
          invent a ticket or fake its odds. Below is the real slate the generator
          will draw from — the moment the model runs, tickets appear here.
        </p>
      </div>
    </div>
  )
}

function GeneratedTickets({
  byProfile,
  candidateCount,
}: {
  byProfile: Map<RiskProfileId, ProfileResult>
  candidateCount: number
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div>
          <p className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            This week&apos;s BSE tickets
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {`Built from ${candidateCount} qualifying leg${candidateCount === 1 ? "" : "s"} — one per game, each clearing BSE's spread-edge gate.`}
          </p>
        </div>
      </div>

      {OBJECTIVE_ORDER.map((id) => {
        const result = byProfile.get(id)
        if (!result) return null
        return <TicketCard key={id} result={result} />
      })}

      <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
        Signals from the frozen BSE model, under live 2026 validation — not a
        performance guarantee. Combined price is DraftKings&apos; real parlay
        juice, not an expected value or win-probability claim.
      </p>
    </div>
  )
}

const BADGE_STYLE: Record<BetClassification, string> = {
  STRONG_LINE_PRICE_OK: "border-[var(--rating-strong)]/40 bg-[var(--rating-strong)]/10 text-[var(--rating-strong)]",
  GOOD_LINE_EXPENSIVE: "border-[var(--rating-mid)]/40 bg-[var(--rating-mid)]/10 text-[var(--rating-mid)]",
  NO_EDGE: "border-border bg-secondary/50 text-muted-foreground",
  INSUFFICIENT_DATA: "border-border bg-secondary/50 text-muted-foreground",
}

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
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}`
}

function TicketCard({ result }: { result: ProfileResult }) {
  const meta = PROFILE_META[result.profile]

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <span className="flex items-center gap-2">
          <meta.icon className="size-4 text-primary" />
          <span className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
            {result.label}
          </span>
        </span>
        {result.ticket ? (
          <span className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>{`${result.ticket.legCount} legs`}</span>
            <span aria-hidden="true">·</span>
            <span>{`edge ${fmtEdge(result.ticket.totalLineEdge)}`}</span>
            {result.ticket.combinedAmerican != null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-foreground">{fmtPrice(result.ticket.combinedAmerican)}</span>
              </>
            )}
          </span>
        ) : (
          <span className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            No ticket
          </span>
        )}
      </div>

      {result.ticket ? (
        <ul className="divide-y divide-border">
          {result.ticket.legs.map((leg) => (
            <LegRow key={leg.gameId} leg={leg} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm leading-relaxed text-muted-foreground">{result.reason}</p>
      )}
    </div>
  )
}

function LegRow({ leg }: { leg: GameRead }) {
  const cls = leg.classification ?? "INSUFFICIENT_DATA"
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          <span>{formatKickoffDate(leg.kickoff)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatKickoff(leg.kickoff, false)}</span>
        </div>
        <p className="mt-1 font-display text-base font-semibold text-foreground">
          {`${leg.pickedTeamName} ${fmtSpread(leg.pickedSpread)}`}
          {leg.price != null && (
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{fmtPrice(leg.price)}</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{leg.matchup}</p>
        {/* Line provenance + shopping recommendation. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-[var(--rating-strong)]/40 bg-[var(--rating-strong)]/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--rating-strong)]">
            {LINE_SOURCE_COPY[leg.source].label}
          </span>
          {leg.recommendationText && (
            <span className="font-mono text-[10px] leading-relaxed text-muted-foreground">
              {leg.recommendation === "STAY_AT_MAIN" ? "Main line" : "Buy alt"} · {leg.recommendationText}
            </span>
          )}
        </div>
        {/* Audit trail: leg is traceable to this bse_board_signal + DK snapshot. */}
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground/80">
          {`#${leg.gameId} · fair ${fmtSpread(leg.fairHomeSpread)} · ${leg.bookmaker ?? "dk"}${leg.snapshotAt ? ` · ${new Date(leg.snapshotAt).toISOString().slice(0, 16).replace("T", " ")}Z` : ""}`}
        </p>
      </div>
      <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
        <span className="font-display text-lg font-semibold tabular-nums text-foreground">{`${fmtEdge(leg.lineEdge)} pt`}</span>
        <span className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${BADGE_STYLE[cls]}`}>
          {CLASSIFICATION_COPY[cls].label}
        </span>
      </div>
    </li>
  )
}
