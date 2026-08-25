/**
 * Pure, deterministic grading math. No I/O, no DB — given a frozen pick and a
 * final score, it returns the WIN/LOSS/PUSH grade and the units won/lost off
 * the FROZEN American price. Re-running with the same inputs always yields the
 * same output (idempotent by construction).
 */

export type Market = "spread" | "total" | "moneyline"
export type PickSide = "home" | "away" | "over" | "under"
export type Grade = "win" | "loss" | "push"

export interface GradeInput {
  market: Market
  pickSide: PickSide
  /** Frozen line: spread (relative to pick side's team) or total points. Null for moneyline. */
  lineValue: number | null
  /** Frozen American odds. Falls back to -110 for spread/total when absent. */
  priceAmerican: number | null
  homeScore: number
  awayScore: number
}

export interface GradeResult {
  grade: Grade
  unitsDelta: number
}

/** Profit (in units) on a 1-unit WIN at the given American odds. */
export function unitsForWin(priceAmerican: number | null, fallback = -110): number {
  const price = priceAmerican ?? fallback
  if (price > 0) return price / 100
  if (price < 0) return 100 / Math.abs(price)
  return 0
}

function settle(grade: Grade, priceAmerican: number | null): GradeResult {
  if (grade === "push") return { grade, unitsDelta: 0 }
  if (grade === "win") return { grade, unitsDelta: round2(unitsForWin(priceAmerican)) }
  return { grade, unitsDelta: -1 }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Grade a spread pick. `lineValue` is the spread applied to the PICKED team
 * (e.g. picking Georgia -6.5 → pickSide 'home' or 'away' with lineValue -6.5).
 * Win if (pickTeamMargin + lineValue) > 0, push if exactly 0, else loss.
 */
export function gradeSpread(input: GradeInput): GradeResult {
  const { pickSide, lineValue, priceAmerican, homeScore, awayScore } = input
  const line = lineValue ?? 0
  const pickTeamMargin = pickSide === "home" ? homeScore - awayScore : awayScore - homeScore
  const adjusted = pickTeamMargin + line
  if (adjusted > 0) return settle("win", priceAmerican)
  if (adjusted === 0) return settle("push", priceAmerican)
  return settle("loss", priceAmerican)
}

/** Grade a total pick against the combined score. Push on an exact landing. */
export function gradeTotal(input: GradeInput): GradeResult {
  const { pickSide, lineValue, priceAmerican, homeScore, awayScore } = input
  const combined = homeScore + awayScore
  const line = lineValue ?? 0
  if (combined === line) return settle("push", priceAmerican)
  const over = combined > line
  const win = (pickSide === "over" && over) || (pickSide === "under" && !over)
  return settle(win ? "win" : "loss", priceAmerican)
}

/** Grade a moneyline pick. The picked team must win outright. Tie → push. */
export function gradeMoneyline(input: GradeInput): GradeResult {
  const { pickSide, priceAmerican, homeScore, awayScore } = input
  if (homeScore === awayScore) return settle("push", priceAmerican)
  const homeWon = homeScore > awayScore
  const win = (pickSide === "home" && homeWon) || (pickSide === "away" && !homeWon)
  return settle(win ? "win" : "loss", priceAmerican)
}

/** Dispatch to the correct market grader. */
export function gradePick(input: GradeInput): GradeResult {
  switch (input.market) {
    case "spread":
      return gradeSpread(input)
    case "total":
      return gradeTotal(input)
    case "moneyline":
      return gradeMoneyline(input)
    default:
      throw new Error(`Unknown market: ${input.market as string}`)
  }
}
