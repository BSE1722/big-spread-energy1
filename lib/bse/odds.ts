/**
 * Pure sportsbook-odds math. No mock data, no model assumptions — just the
 * arithmetic of prices and probabilities. Safe to unit test and reuse.
 */

export function americanToDecimal(american: number): number {
  if (american === 0) return 1
  return american > 0 ? american / 100 + 1 : 100 / Math.abs(american) + 1
}

export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) return 0
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1))
}

/** Implied probability from an American price (includes the book's vig). */
export function impliedProbability(american: number): number {
  return 1 / americanToDecimal(american)
}

export function probabilityToDecimal(p: number): number {
  const clamped = clampProb(p)
  return 1 / clamped
}

export function probabilityToAmerican(p: number): number {
  return decimalToAmerican(probabilityToDecimal(p))
}

/**
 * Remove the vig from a two-way market, returning fair (normalized)
 * probabilities that sum to 1.
 */
export function removeVigTwoWay(pA: number, pB: number): [number, number] {
  const total = pA + pB
  if (total <= 0) return [pA, pB]
  return [pA / total, pB / total]
}

/** Expected value per unit staked given a true probability and decimal odds. */
export function evPerUnit(trueProb: number, decimalOdds: number): number {
  const p = clampProb(trueProb)
  return p * (decimalOdds - 1) - (1 - p)
}

/** Full-Kelly stake fraction (never negative). */
export function kellyFraction(trueProb: number, decimalOdds: number): number {
  const b = decimalOdds - 1
  if (b <= 0) return 0
  const p = clampProb(trueProb)
  const f = (p * b - (1 - p)) / b
  return Math.max(0, f)
}

/** Combine a set of decimal prices into a single parlay decimal price. */
export function parlayDecimal(decimals: number[]): number {
  return decimals.reduce((acc, d) => acc * d, 1)
}

export function clampProb(p: number): number {
  return Math.min(0.999, Math.max(0.001, p))
}

export function formatAmerican(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

/** Signed number for lines/edges, e.g. +2.5 / -6.5. */
export function formatSigned(n: number, digits = 1): string {
  const v = n.toFixed(digits)
  return n > 0 ? `+${v}` : v
}

export function formatPercent(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`
}
