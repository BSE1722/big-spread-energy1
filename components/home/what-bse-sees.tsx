"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useLiveBoard } from "@/lib/use-live-board"
import { heroSignal, topDisagreements, formatFavoredHomeRel, type HomeSignal } from "@/lib/home-signals"
import { CONTEXT_FACTORS, type FactorDisposition } from "@/lib/bse/context-engine"
import { TeamName } from "@/components/team-name"
import { BseRatingBadge } from "@/components/board/bse-rating-badge"

/**
 * WHAT DOES BSE SEE? — the signature brand property. Takes ONE real current game
 * (the top disagreement) and shows the sportsbook line vs the BSE fair line, THE
 * GAP between them, and then the honest context ledger straight from the frozen
 * CONTEXT_FACTORS map: what is already in the base model, what is context-only,
 * and what is not wired. It never claims an unwired factor moved the number.
 */

const DISPOSITION_META: Record<FactorDisposition, { tag: string; className: string }> = {
  active: { tag: "Context — Active", className: "text-primary border-primary/40 bg-primary/10" },
  in_base: { tag: "In Base Model", className: "text-foreground border-border bg-secondary/50" },
  totals_only: { tag: "Context Only", className: "text-rating-mid border-rating-mid/40 bg-rating-mid/10" },
  data_unavailable: { tag: "Not Wired", className: "text-muted-foreground border-border bg-secondary/30" },
  not_wired: { tag: "Not Wired", className: "text-muted-foreground border-border bg-secondary/30" },
}

export function WhatBseSees() {
  const { games, loading } = useLiveBoard()
  const signal = heroSignal(games) ?? topDisagreements(games, 1)[0] ?? null

  return (
    <section className="border-b border-border/60 bg-background py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-8 max-w-2xl">
          <span className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.18em] text-primary">
            The BSE Difference
          </span>
          <h2 className="mt-2 font-display text-4xl font-bold uppercase leading-[0.9] tracking-tight text-foreground sm:text-5xl">
            What Does BSE See?
          </h2>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            The book gives you one number. BSE gives you a second, independent
            number — then shows you exactly what is behind it, and what isn&apos;t.
          </p>
        </header>

        {loading && !signal && <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />}

        {signal ? (
          <Explainer signal={signal} />
        ) : (
          !loading && (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                A featured breakdown appears here once BSE publishes ratings for this week&apos;s slate.{" "}
                <Link href="/board" className="text-primary underline-offset-2 hover:underline">
                  Open the Board
                </Link>
                .
              </p>
            </div>
          )
        )}
      </div>
    </section>
  )
}

function Explainer({ signal }: { signal: HomeSignal }) {
  const { game } = signal
  const market = formatFavoredHomeRel(signal.marketSpread, game.home, game.away)
  const fair = formatFavoredHomeRel(signal.fairSpread, game.home, game.away)

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      {/* Line vs line vs gap */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex flex-col gap-1">
            <TeamName name={game.away.name} abbr={game.away.abbr} size="sm" />
            <TeamName name={game.home.name} abbr={game.home.abbr} size="sm" />
          </div>
          <BseRatingBadge rating={signal.rating} size="sm" />
        </div>

        <div className="grid grid-cols-3 divide-x divide-border">
          <LineCol label="Sportsbook Line" abbr={market.abbr} value={market.line} />
          <LineCol label="BSE Fair Line" abbr={fair.abbr} value={fair.line} accent />
          <div className="flex flex-col items-center justify-center gap-1 px-2 py-6 text-center">
            <span className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-foreground">
              The Gap
            </span>
            <span className="font-display text-4xl font-bold tabular-nums text-primary text-glow">
              {signal.absGap.toFixed(1)}
            </span>
            <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">
              pts · {signal.valueTeam.abbr}
            </span>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {signal.disagrees ? (
              <>
                BSE&apos;s number is <span className="font-semibold text-foreground">{signal.absGap.toFixed(1)} points</span>{" "}
                off the market on <span className="font-semibold text-primary">{signal.valueTeam.name}</span>. That clears
                BSE&apos;s tracking threshold — so the machine is asserting a read at the current number.
              </>
            ) : (
              <>
                BSE and the market are within{" "}
                <span className="font-semibold text-foreground">{signal.absGap.toFixed(1)} points</span> — inside the
                agreement zone, so BSE is not asserting a side here.
              </>
            )}
          </p>
          <Link
            href={`/game/${game.id}`}
            className="mt-4 inline-flex min-h-11 items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-primary hover:text-primary/80"
          >
            See The Full Breakdown <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Honest context ledger */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
            What&apos;s Behind The Number
          </h3>
          <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-wide text-muted-foreground">
            Every factor, and how BSE treats it
          </p>
        </div>
        <ul className="divide-y divide-border/60">
          {CONTEXT_FACTORS.map((f) => {
            const meta = DISPOSITION_META[f.disposition]
            return (
              <li key={f.key} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0 text-sm font-medium text-foreground">{f.label}</span>
                <span
                  className={`shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[0.5625rem] font-bold uppercase tracking-wider ${meta.className}`}
                >
                  {meta.tag}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="border-t border-border px-5 py-3 font-mono text-[0.625rem] leading-relaxed text-muted-foreground">
          &ldquo;In Base Model&rdquo; factors are already priced into the frozen number and never re-added. BSE never
          pretends an unwired factor moved the line.
        </p>
      </div>
    </div>
  )
}

function LineCol({
  label,
  abbr,
  value,
  accent,
}: {
  label: string
  abbr: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-2 py-6 text-center">
      <span className="max-w-full truncate font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span className={`font-display text-4xl font-bold tabular-nums ${accent ? "text-foreground" : "text-foreground"}`}>
        {value}
      </span>
      <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-muted-foreground">{abbr}</span>
    </div>
  )
}
