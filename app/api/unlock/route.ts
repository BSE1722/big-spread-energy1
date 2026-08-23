import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { weeklyUnlocks } from "@/lib/db/schema"
import { getSessionUser, isProUser, getWeeklyUnlock } from "@/lib/access"
import { getCurrentContext } from "@/lib/bse/season"
import { getCfbdGameLites } from "@/lib/board-build"

/**
 * Spend the Rookie's ONE free weekly breakdown on a specific game.
 *
 * Server-side guarantees (a client cannot get extra unlocks):
 *  - Requires a Better Auth session.
 *  - Pro users don't need this (they already see everything).
 *  - The (userId, season, week) UNIQUE constraint means a second unlock attempt
 *    in the same week fails at the database level, no matter how many times the
 *    user refreshes, logs out/in, or switches devices. We translate that unique
 *    violation into a clean "already used" response.
 *  - The chosen gameId is validated against the current snapshot so a Rookie
 *    cannot unlock a non-existent/other-week game.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "You must be signed in." }, { status: 401 })
  }

  // Pro users have unlimited access; no need to spend a weekly credit.
  if (await isProUser(user.id)) {
    return NextResponse.json(
      { ok: false, error: "BSE Pro already has unlimited breakdowns." },
      { status: 400 },
    )
  }

  let body: { gameId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 })
  }
  const gameId = typeof body.gameId === "string" ? body.gameId.trim() : ""
  if (!gameId) {
    return NextResponse.json({ ok: false, error: "Missing gameId." }, { status: 400 })
  }

  const ctx = getCurrentContext()

  // If they've already spent this week, tell them which game (idempotent-ish:
  // re-unlocking the SAME game returns success so a double-tap is harmless).
  const existing = await getWeeklyUnlock(user.id, ctx)
  if (existing) {
    if (existing.gameId === gameId) {
      return NextResponse.json({ ok: true, alreadyUnlocked: true, unlock: existing })
    }
    return NextResponse.json(
      {
        ok: false,
        error: "You've already used this week's free breakdown.",
        weeklyUnlock: existing,
      },
      { status: 409 },
    )
  }

  // Validate the game exists on the current week's CFBD schedule (the canonical
  // game list / identity source) and capture the matchup label for display.
  // Never fabricate — if the id isn't a real game this week, reject.
  const cfbdGames = await getCfbdGameLites(ctx).catch(() => [])
  const game = cfbdGames.find((g) => g.id === gameId) ?? null
  if (!game) {
    return NextResponse.json(
      { ok: false, error: "That game isn't on the current Board." },
      { status: 404 },
    )
  }
  const matchup = `${game.away.name} at ${game.home.name}`

  try {
    await db.insert(weeklyUnlocks).values({
      id: randomUUID(),
      userId: user.id,
      season: ctx.season,
      week: ctx.week,
      gameId,
      matchup,
    })
  } catch (error) {
    // Unique-constraint violation → a concurrent/duplicate unlock. Return the
    // row that won the race instead of erroring out.
    const winner = await getWeeklyUnlock(user.id, ctx)
    if (winner) {
      if (winner.gameId === gameId) {
        return NextResponse.json({ ok: true, alreadyUnlocked: true, unlock: winner })
      }
      return NextResponse.json(
        {
          ok: false,
          error: "You've already used this week's free breakdown.",
          weeklyUnlock: winner,
        },
        { status: 409 },
      )
    }
    console.log("[v0] unlock insert failed:", (error as Error)?.message)
    return NextResponse.json({ ok: false, error: "Could not unlock this game." }, { status: 500 })
  }

  const unlock = await getWeeklyUnlock(user.id, ctx)
  return NextResponse.json({ ok: true, unlock })
}
