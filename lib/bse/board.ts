/**
 * Board builder + data access.
 *
 * Turns compact provider seeds (mock-data.ts) into fully-formed `Game` objects
 * — synthesizing a multi-sportsbook market with opening lines and movement —
 * and grades every selection through the model / rating services into
 * `BoardRow`s. This is the ONLY module that assembles games; the UI and the
 * parlay services consume its output.
 *
 * Replace `mock-data` with a live odds API + real model and nothing downstream
 * changes.
 */

import type {
  BoardRow,
  BoardSelectionView,
  BookOffer,
  Game,
  GameSeed,
  League,
  MarketSeed,
  MarketSelection,
  MarketSide,
  MarketType,
  Sport,
  Sportsbook,
  Team,
} from "./types"
import {
  CURRENT_CONTEXT,
  MOCK_DATA_SOURCE,
  MOCK_SNAPSHOT_TIME,
  MOCK_SPORTSBOOKS,
  getRawGames,
  getRawTeamMetrics,
} from "./mock-data"
import {
  americanToDecimal,
  clampProb,
  evPerUnit,
  impliedProbability,
  probabilityToAmerican,
  removeVigTwoWay,
} from "./odds"
import { bseModel } from "./model"
import { computeBseRating } from "./rating"

/* ------------------------------------------------------------------ */
/* Deterministic jitter so a "multi-book" market looks realistic but   */
/* stays stable across renders (no Math.random → no hydration drift).  */
/* ------------------------------------------------------------------ */

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

/** Small signed jitter in [-mag, mag] keyed by a string. */
function jitter(key: string, mag: number): number {
  return (hash(key) - 0.5) * 2 * mag
}

/* ------------------------------------------------------------------ */
/* Team + side helpers                                                 */
/* ------------------------------------------------------------------ */

function makeTeam(
  seed: GameSeed["home"],
  league: League,
): Team {
  const metrics = getRawTeamMetrics(seed.name)
  return {
    id: seed.abbr.toLowerCase(),
    league,
    name: seed.name,
    abbr: seed.abbr,
    rank: seed.rank,
    record: metrics ? undefined : undefined,
  }
}

/** Signed line for a given side of a market, from the home-perspective seed. */
function lineForSide(
  marketType: MarketType,
  side: MarketSide,
  homeLine: number,
): number {
  if (marketType === "spread") {
    // homeLine is the home spread; away is its negation.
    return side === "home" ? homeLine : -homeLine
  }
  if (marketType === "total") {
    return homeLine // total line is the same number for over/under
  }
  return 0
}

/* ------------------------------------------------------------------ */
/* Build one market's selections across multiple books                 */
/* ------------------------------------------------------------------ */

interface BuiltSelection {
  selection: MarketSelection
  edge: number
}

function buildMoneylineOffers(
  gameId: string,
  side: MarketSide,
  homeMarketAmerican: number,
  homeOpenAmerican: number,
): BookOffer[] {
  // Convert home ML into the side's ML (rough two-way mirror for demo).
  const base =
    side === "home" ? homeMarketAmerican : mirrorMoneyline(homeMarketAmerican)
  const open =
    side === "home" ? homeOpenAmerican : mirrorMoneyline(homeOpenAmerican)
  return MOCK_SPORTSBOOKS.map((book, i) => {
    const j = Math.round(jitter(`${gameId}-${side}-ml-${book.id}`, 12))
    return {
      book: book.id,
      line: 0,
      price: base + j,
      opening: { line: 0, price: open, timestamp: openingTime() },
      lastUpdated: MOCK_SNAPSHOT_TIME,
    } as BookOffer
  }).concat([
    {
      book: "consensus" as Sportsbook,
      line: 0,
      price: base,
      opening: { line: 0, price: open, timestamp: openingTime() },
      lastUpdated: MOCK_SNAPSHOT_TIME,
    },
  ])
}

/** Rough moneyline mirror for the opposite side (demo only). */
function mirrorMoneyline(american: number): number {
  const p = impliedProbability(american)
  const opp = clampProb(1 - p * 0.96) // leave a little vig in
  return probabilityToAmerican(opp)
}

function buildPointOffers(
  gameId: string,
  marketType: MarketType,
  side: MarketSide,
  homeMarketLine: number,
  homeOpenLine: number,
  priceCenter = -110,
): BookOffer[] {
  const line = lineForSide(marketType, side, homeMarketLine)
  const openLine = lineForSide(marketType, side, homeOpenLine)
  const perBook = MOCK_SPORTSBOOKS.map((book) => {
    const lj = Math.round(jitter(`${gameId}-${side}-${marketType}-${book.id}-l`, 1)) * 0.5
    const pj = Math.round(jitter(`${gameId}-${side}-${marketType}-${book.id}-p`, 8))
    return {
      book: book.id,
      line: line + lj,
      price: priceCenter + pj,
      opening: { line: openLine, price: priceCenter, timestamp: openingTime() },
      lastUpdated: MOCK_SNAPSHOT_TIME,
    } as BookOffer
  })
  return perBook.concat([
    {
      book: "consensus" as Sportsbook,
      line,
      price: priceCenter,
      opening: { line: openLine, price: priceCenter, timestamp: openingTime() },
      lastUpdated: MOCK_SNAPSHOT_TIME,
    },
  ])
}

function openingTime(): string {
  return "2026-08-18T09:00:00.000Z"
}

function sideLabel(
  marketType: MarketType,
  side: MarketSide,
  home: Team,
  away: Team,
  line: number,
): string {
  if (marketType === "moneyline") {
    return `${side === "home" ? home.abbr : away.abbr} ML`
  }
  if (marketType === "total") {
    return `${side === "over" ? "Over" : "Under"} ${Math.abs(line).toFixed(1)}`
  }
  const team = side === "home" ? home.abbr : away.abbr
  const signed = line > 0 ? `+${line.toFixed(1)}` : line.toFixed(1)
  return `${team} ${signed}`
}

function buildSelection(
  game: { id: string; league: League; home: Team; away: Team },
  marketType: MarketType,
  side: MarketSide,
  seed: MarketSeed,
  fairHomeMargin: number,
): BuiltSelection {
  const offers =
    marketType === "moneyline"
      ? buildMoneylineOffers(game.id, side, seed.marketLine, seed.openLine)
      : buildPointOffers(game.id, marketType, side, seed.marketLine, seed.openLine)

  // Fair line for THIS side.
  const fairLine =
    marketType === "spread"
      ? lineForSide("spread", side, seed.fairLineDemo)
      : marketType === "total"
        ? seed.fairLineDemo
        : 0
  const marketLine =
    marketType === "spread"
      ? lineForSide("spread", side, seed.marketLine)
      : marketType === "total"
        ? seed.marketLine
        : 0

  const projection = bseModel.projectSelection({
    league: game.league,
    marketType,
    side,
    fairLine,
    marketLine,
    fairHomeMargin: side === "home" ? fairHomeMargin : -fairHomeMargin,
    confidence: seed.confidence,
    generatedAt: MOCK_SNAPSHOT_TIME,
  })

  const label = sideLabel(marketType, side, game.home, game.away, marketLine)
  const edge = bseModel.edgeFor({ marketType, side, fairLine, marketLine })

  const selection: MarketSelection = {
    id: `${game.id}-${marketType}-${side}`,
    gameId: game.id,
    marketType,
    side,
    label,
    offers,
    projection,
    source: MOCK_DATA_SOURCE,
    lastUpdated: MOCK_SNAPSHOT_TIME,
  }
  return { selection, edge }
}

/* ------------------------------------------------------------------ */
/* Assemble a full Game from a seed                                    */
/* ------------------------------------------------------------------ */

function buildGame(seed: GameSeed): Game {
  const league = CURRENT_CONTEXT.league
  const sport: Sport = CURRENT_CONTEXT.sport
  const home = makeTeam(seed.home, league)
  const away = makeTeam(seed.away, league)
  const base = { id: seed.id, league, home, away }

  // Fair home margin (points home is expected to win by) from the spread seed.
  const fairHomeMargin = -seed.markets.spread.fairLineDemo

  const built: BuiltSelection[] = [
    buildSelection(base, "spread", "home", seed.markets.spread, fairHomeMargin),
    buildSelection(base, "spread", "away", seed.markets.spread, fairHomeMargin),
    buildSelection(base, "total", "over", seed.markets.total, fairHomeMargin),
    buildSelection(base, "total", "under", seed.markets.total, fairHomeMargin),
    buildSelection(base, "moneyline", "home", seed.markets.moneyline, fairHomeMargin),
    buildSelection(base, "moneyline", "away", seed.markets.moneyline, fairHomeMargin),
  ]

  return {
    id: seed.id,
    sport,
    league,
    season: CURRENT_CONTEXT.season,
    week: CURRENT_CONTEXT.week,
    kickoff: seed.kickoff,
    network: seed.network,
    status: "scheduled",
    home,
    away,
    selections: built.map((b) => b.selection),
    dataSource: MOCK_DATA_SOURCE,
    lastUpdated: MOCK_SNAPSHOT_TIME,
    isMock: true,
  }
}

/* ------------------------------------------------------------------ */
/* Grade a selection into a board view (best line, EV, rating)         */
/* ------------------------------------------------------------------ */

/** Pick the best available price/line for the bettor across books. */
export function bestOffer(sel: MarketSelection): BookOffer {
  const books = sel.offers.filter((o) => o.book !== "consensus")
  const pool = books.length ? books : sel.offers
  // Best = highest decimal payout (for point markets, also prefer better line).
  return pool.reduce((best, o) =>
    americanToDecimal(o.price) > americanToDecimal(best.price) ? o : best,
  )
}

function consensusOffer(sel: MarketSelection): BookOffer {
  return sel.offers.find((o) => o.book === "consensus") ?? sel.offers[0]
}

/** Market-quality proxy: more books + tighter price spread = higher quality. */
function marketQuality(sel: MarketSelection): number {
  const prices = sel.offers.filter((o) => o.book !== "consensus").map((o) => o.price)
  if (prices.length < 2) return 0.4
  const spread = Math.max(...prices) - Math.min(...prices)
  const bookScore = Math.min(1, prices.length / 4)
  const tightness = Math.max(0, 1 - spread / 40)
  return clampProb(0.5 * bookScore + 0.5 * tightness)
}

export function gradeSelection(
  game: Game,
  sel: MarketSelection,
): BoardSelectionView {
  const consensus = consensusOffer(sel)
  const best = bestOffer(sel)
  const marketLine = consensus.line
  const fairLine = sel.projection.fairLine

  // Edge in points (favorable-signed) for the side.
  const edge = bseModel.edgeFor({
    marketType: sel.marketType,
    side: sel.side,
    fairLine,
    marketLine,
  })

  const trueProb = sel.projection.fairProbability
  const impliedRaw = impliedProbability(best.price)

  // No-vig implied prob using the paired opposite side, when present.
  const opposite = game.selections.find(
    (s) => s.marketType === sel.marketType && s.id !== sel.id && isPair(sel.side, s.side),
  )
  let noVig = impliedRaw
  if (opposite) {
    const [p] = removeVigTwoWay(
      impliedProbability(consensusOffer(sel).price),
      impliedProbability(consensusOffer(opposite).price),
    )
    noVig = p
  }

  const dec = americanToDecimal(best.price)
  const ev = evPerUnit(trueProb, dec)

  const lineMovement = consensus.line - consensus.opening.line
  // Does line movement agree with the model's edge direction?
  const lineAgreement = clampProb(0.5 + Math.sign(edge) * Math.sign(lineMovement) * 0.25 + 0.25)

  const rating = computeBseRating({
    edgePoints: Math.max(0, edge),
    probabilityAdvantage: trueProb - noVig,
    evPerUnit: ev,
    modelConfidence: sel.projection.confidence,
    marketQuality: marketQuality(sel),
    lineAgreement,
    uncertainty: 1 - sel.projection.confidence,
  })

  return {
    selectionId: sel.id,
    marketType: sel.marketType,
    side: sel.side,
    label: sel.label,
    marketLine,
    fairLine,
    edge,
    bestBook: best.book,
    bestPrice: best.price,
    impliedProbability: noVig,
    trueProbability: trueProb,
    evPerUnit: ev,
    rating,
    lineMovement,
    modelConfidence: sel.projection.confidence,
  }
}

function isPair(a: MarketSide, b: MarketSide): boolean {
  return (
    (a === "home" && b === "away") ||
    (a === "away" && b === "home") ||
    (a === "over" && b === "under") ||
    (a === "under" && b === "over")
  )
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

let _gamesCache: Game[] | null = null

export function getGames(): Game[] {
  if (!_gamesCache) {
    _gamesCache = getRawGames().map(buildGame)
  }
  return _gamesCache
}

export function getGameById(id: string): Game | undefined {
  return getGames().find((g) => g.id === id)
}

export function getSelection(
  gameId: string,
  marketType: MarketType,
  side: MarketSide,
): { game: Game; selection: MarketSelection } | undefined {
  const game = getGameById(gameId)
  if (!game) return undefined
  const selection = game.selections.find(
    (s) => s.marketType === marketType && s.side === side,
  )
  if (!selection) return undefined
  return { game, selection }
}

/** Build the full board: one row per game, with a graded primary selection. */
export function getBoard(): BoardRow[] {
  return getGames().map((game) => {
    const graded = game.selections.map((s) => gradeSelection(game, s))
    // Primary = highest-rated selection for the game.
    const primary = graded.reduce((best, v) => (v.rating.score > best.rating.score ? v : best))
    return { gameId: game.id, game, primary, selections: graded }
  })
}

/** All graded selections across all games (eligible pool for parlays). */
export function getAllGradedSelections(): { game: Game; view: BoardSelectionView }[] {
  const out: { game: Game; view: BoardSelectionView }[] = []
  for (const game of getGames()) {
    for (const sel of game.selections) {
      out.push({ game, view: gradeSelection(game, sel) })
    }
  }
  return out
}

export function gameLabel(game: Game): string {
  return `${game.away.abbr} @ ${game.home.abbr}`
}
