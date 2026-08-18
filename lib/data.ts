/**
 * COMPATIBILITY SHIM.
 *
 * The real data now lives in the BSE service layer (`@/lib/bse`). This module
 * re-derives the original flat shapes the existing Board / Ratings / Top-Edges
 * components expect, so their visual design is preserved while the numbers now
 * come from centralized, typed, provider-agnostic data.
 *
 * New code should import from `@/lib/bse` (and `@/lib/bse/hooks`) directly.
 * This file exists only to avoid rewriting components whose look must not change.
 */

import {
  getBoard,
  getGames,
  gameLabel,
  bestOffer,
  ratingTierLabel,
  getRawTeamMetrics,
  formatSigned,
} from "@/lib/bse"
import type { BoardRow, BoardSelectionView, Game as BseGame } from "@/lib/bse"

/* ----------------------------- Legacy types ----------------------------- */

export type Team = {
  name: string
  abbr: string
  rank?: number
  record: string
}

export type Game = {
  id: string
  kickoff: string
  network: string
  status: "upcoming" | "live"
  away: Team
  home: Team
  marketSpread: number
  marketTotal: number
  marketMoneylineHome: number
  marketMoneylineAway: number
  fairSpread: number
  fairTotal: number
  edgeSpread: number
  edgeTotal: number
  bseRating: number
  pick: string
  side: "home" | "away" | "over" | "under"
}

/* ------------------------ Derivation from BSE layer ---------------------- */

function fmtKickoff(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" })
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  })
  return `${day} ${time} ET`
}

function consensusLine(game: BseGame, market: "spread" | "total", side: "home" | "over"): number {
  const sel = game.selections.find((s) => s.marketType === market && s.side === side)
  const offer = sel?.offers.find((o) => o.book === "consensus")
  return offer?.line ?? 0
}

function consensusPrice(game: BseGame, side: "home" | "away"): number {
  const sel = game.selections.find((s) => s.marketType === "moneyline" && s.side === side)
  const offer = sel?.offers.find((o) => o.book === "consensus")
  return offer?.price ?? 0
}

function fairSideView(row: BoardRow): BoardSelectionView {
  return row.primary
}

function legacyGameFromRow(row: BoardRow): Game {
  const g = row.game
  const spreadHome = consensusLine(g, "spread", "home")
  const total = consensusLine(g, "total", "over")
  const spreadSel = g.selections.find((s) => s.marketType === "spread" && s.side === "home")
  const totalSel = g.selections.find((s) => s.marketType === "total" && s.side === "over")
  const primary = fairSideView(row)

  return {
    id: g.id,
    kickoff: fmtKickoff(g.kickoff),
    network: g.network ?? "TBD",
    status: g.status === "live" ? "live" : "upcoming",
    away: {
      name: g.away.name,
      abbr: g.away.abbr,
      rank: g.away.rank,
      record: g.away.record ?? "",
    },
    home: {
      name: g.home.name,
      abbr: g.home.abbr,
      rank: g.home.rank,
      record: g.home.record ?? "",
    },
    marketSpread: spreadHome,
    marketTotal: total,
    marketMoneylineHome: consensusPrice(g, "home"),
    marketMoneylineAway: consensusPrice(g, "away"),
    fairSpread: spreadSel?.projection.fairLine ?? spreadHome,
    fairTotal: totalSel?.projection.fairLine ?? total,
    edgeSpread: Math.abs(
      row.selections.find((s) => s.marketType === "spread")?.edge ?? 0,
    ),
    edgeTotal: Math.abs(
      row.selections.find((s) => s.marketType === "total")?.edge ?? 0,
    ),
    bseRating: primary.rating.score,
    pick: primary.label,
    side: primary.side,
  }
}

export const games: Game[] = getBoard().map(legacyGameFromRow)

/* ------------------------------- Helpers -------------------------------- */

export function edgeGrade(edge: number): { label: string; tone: "elite" | "strong" | "lean" | "pass" } {
  if (edge >= 3.5) return { label: "ELITE", tone: "elite" }
  if (edge >= 2.5) return { label: "STRONG", tone: "strong" }
  if (edge >= 1.5) return { label: "LEAN", tone: "lean" }
  return { label: "PASS", tone: "pass" }
}

export function formatSpread(n: number): string {
  return formatSigned(n)
}

export function formatMoneyline(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

/* ------------------------------ BSE Ratings ----------------------------- */

export type BseRatingRow = {
  rank: number
  team: string
  abbr: string
  rating: number
  offense: number
  defense: number
  trend: "up" | "down" | "flat"
}

/** Derived from the board's teams + their (placeholder) demo metrics. */
export const bseRatings: BseRatingRow[] = (() => {
  const teams = new Map<string, { name: string; abbr: string }>()
  for (const g of getGames()) {
    teams.set(g.home.name, { name: g.home.name, abbr: g.home.abbr })
    teams.set(g.away.name, { name: g.away.name, abbr: g.away.abbr })
  }
  const rows = [...teams.values()]
    .map((t) => {
      const m = getRawTeamMetrics(t.name)
      return {
        team: t.name,
        abbr: t.abbr,
        rating: m?.rating ?? 60,
        offense: m?.offense ?? 60,
        defense: m?.defense ?? 60,
      }
    })
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 8)
    .map((r, i) => ({
      rank: i + 1,
      team: r.team,
      abbr: r.abbr,
      // Present on a familiar 0-100 style scale; clearly demo data.
      rating: Number((r.rating + 0.4).toFixed(1)),
      offense: r.offense,
      defense: r.defense,
      trend: (i % 3 === 0 ? "up" : i % 3 === 1 ? "flat" : "down") as "up" | "down" | "flat",
    }))
  return rows
})()

/* --------------------------- Legacy odds utils -------------------------- */

export function toDecimal(american: number): number {
  return american > 0 ? american / 100 + 1 : 100 / Math.abs(american) + 1
}

export function toAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100)
  return Math.round(-100 / (decimal - 1))
}

/* --------- Legacy parlay leg list (Analyzer/Generator get rewired) ------- */

export type ParlayLeg = {
  id: string
  game: string
  pick: string
  odds: number
  bseRating: number
  edge: number
}

export const parlayGeneratorLegs: ParlayLeg[] = getBoard().map((row) => {
  const best = bestOffer(
    row.game.selections.find((s) => s.id === row.primary.selectionId)!,
  )
  return {
    id: row.primary.selectionId,
    game: gameLabel(row.game),
    pick: row.primary.label,
    odds: best.price,
    bseRating: row.primary.rating.score,
    edge: Number(Math.abs(row.primary.edge).toFixed(1)),
  }
})

export { ratingTierLabel }
