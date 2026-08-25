import "server-only"

import { createHash } from "node:crypto"

/**
 * Server-only tamper-evidence hash for a frozen Official BSE Pick.
 *
 * This is an INTERNAL integrity check, NOT a claim of third-party cryptographic
 * verification. It lets us detect if any frozen field of a published pick was
 * altered after the fact: the hash covers every value that defines the pick,
 * plus the publication timestamp and model version. The client never supplies
 * or influences it — it is computed here at publish time and recomputed to
 * verify.
 */

/** The exact frozen fields the hash commits to. Order matters and is fixed. */
export interface LockableFields {
  gameId: string
  season: number
  week: number
  seasonType: string
  homeTeam: string
  awayTeam: string
  kickoff: string // ISO
  publishedAt: string // ISO
  market: string
  pickSide: string
  pickLabel: string
  lineValue: number | null
  priceAmerican: number | null
  book: string
  bseRating: number | null
  fairLine: number | null
  edgeValue: number | null
  winProb: number | null
  modelVersion: string
}

/**
 * Deterministically serialize the lockable fields (stable key order, explicit
 * nulls) and hash with SHA-256. Two picks with identical frozen content always
 * produce the same hash; any change produces a different one.
 */
export function computeLockHash(fields: LockableFields): string {
  const ordered: Array<[keyof LockableFields, unknown]> = [
    ["gameId", fields.gameId],
    ["season", fields.season],
    ["week", fields.week],
    ["seasonType", fields.seasonType],
    ["homeTeam", fields.homeTeam],
    ["awayTeam", fields.awayTeam],
    ["kickoff", fields.kickoff],
    ["publishedAt", fields.publishedAt],
    ["market", fields.market],
    ["pickSide", fields.pickSide],
    ["pickLabel", fields.pickLabel],
    ["lineValue", fields.lineValue],
    ["priceAmerican", fields.priceAmerican],
    ["book", fields.book],
    ["bseRating", fields.bseRating],
    ["fairLine", fields.fairLine],
    ["edgeValue", fields.edgeValue],
    ["winProb", fields.winProb],
    ["modelVersion", fields.modelVersion],
  ]
  const canonical = ordered
    .map(([k, v]) => `${k}=${v === null || v === undefined ? "\u0000null" : String(v)}`)
    .join("|")
  return createHash("sha256").update(canonical).digest("hex")
}

/** Recompute and compare — true when the stored hash matches the fields. */
export function verifyLockHash(fields: LockableFields, storedHash: string): boolean {
  return computeLockHash(fields) === storedHash
}
