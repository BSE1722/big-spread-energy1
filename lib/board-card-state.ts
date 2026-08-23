import type { AccessResponse } from "@/lib/use-access"

/**
 * The per-game presentation state on the Board, derived from the viewer's
 * access + this game's id. Centralized so the matchup card and the featured
 * panel behave identically.
 */
export type CardState =
  | "loading"
  | "guest" // not signed in → tease + create-account CTA
  | "rookie-available" // signed-in free user who hasn't spent this week
  | "rookie-unlocked" // this is the game they unlocked this week
  | "rookie-used-other" // free, already spent on a different game
  | "pro" // full access

export interface CardAccess {
  state: CardState
  /** True when the full breakdown/premium fields are visible for this game. */
  unlocked: boolean
}

export function cardAccessFor(
  access: AccessResponse | null,
  loading: boolean,
  gameId: string,
): CardAccess {
  if (loading && !access) return { state: "loading", unlocked: false }
  const tier = access?.tier ?? "guest"

  if (tier === "pro") return { state: "pro", unlocked: true }

  if (tier === "rookie") {
    const unlock = access?.weeklyUnlock ?? null
    if (unlock) {
      if (unlock.gameId === gameId) return { state: "rookie-unlocked", unlocked: true }
      return { state: "rookie-used-other", unlocked: false }
    }
    return { state: "rookie-available", unlocked: false }
  }

  return { state: "guest", unlocked: false }
}
