/**
 * BSE VOICE — pure, deterministic personality layer.
 * ===================================================
 *
 * Target voice: 85% knowledgeable football analyst, 15% funny friend who has
 * watched an unhealthy amount of college football. Humor is dry, quick, and
 * used SPARINGLY.
 *
 * HARD RULES (enforced by construction):
 *   - This module NEVER asserts a fact. Every line here is flavor wrapped
 *     around a value the context engine already computed. It cannot change a
 *     number, a side, or a conclusion.
 *   - Selection is DETERMINISTIC from a per-game seed, so phrasing varies
 *     game-to-game but is stable for a given game (no hard-coded identical joke
 *     on every card, and no run-to-run drift that would break snapshots).
 *   - No humor pools reference injuries — injury copy is always straight and is
 *     built elsewhere. Nothing here mocks a player or makes light of an injury.
 */

/** Stable 32-bit FNV-1a hash of a string → deterministic seed. */
export function seedFrom(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministically pick one entry from a pool using the seed. */
export function pick<T>(seed: number, pool: readonly T[]): T {
  return pool[seed % pool.length]
}

/** Deterministic yes/no gate so humor doesn't land on every single game. */
export function gate(seed: number, oneIn: number): boolean {
  return seed % oneIn !== 0
}

type PoolKey =
  | "strongEdge"
  | "smallEdge"
  | "goodTeamBadPrice"
  | "agreement"
  | "bigMove"
  | "marketCaughtUp"
  | "weatherRough"

const POOLS: Record<PoolKey, readonly string[]> = {
  strongEdge: [
    "This is the kind of separation BSE actually gets out of bed for.",
    "That's real daylight, not a rounding error.",
    "When our number is this far off the market, we pay attention.",
  ],
  smallEdge: [
    "Enough to get our attention — not enough to go shopping for a boat.",
    "There's an edge here. We're not mortgaging the house over it.",
    "It's a lean, not a life decision.",
  ],
  goodTeamBadPrice: [
    "Good team, good spot, bad price.",
    "The model likes them. The number? Not so much.",
    "We like the team — we just don't love laying this many points to get them.",
  ],
  agreement: [
    "Congratulations everyone, we've discovered a point spread.",
    "Vegas and BSE are sitting at the same table, which means there's no free lunch.",
    "Both sides landed in basically the same place. Nothing to do here.",
  ],
  bigMove: [
    "This line has moved more than a freshman hunting for the right lecture hall.",
    "Somebody clearly has an opinion — this number has not sat still.",
    "The market has been busy with this one.",
  ],
  marketCaughtUp: [
    "The market has quietly caught up to us, and the value went with it.",
    "Whatever edge lived here has mostly been priced out.",
    "Vegas appears to have noticed the same thing we did.",
  ],
  weatherRough: [
    "Mother Nature has entered the chat.",
    "The forecast is doing its best to make this one ugly.",
    "This is shaping up to be a coats-and-gloves kind of night.",
  ],
}

/** Pull one deterministic personality line for a given pool + seed. */
export function voiceLine(seed: number, key: PoolKey): string {
  return pick(seed, POOLS[key])
}
