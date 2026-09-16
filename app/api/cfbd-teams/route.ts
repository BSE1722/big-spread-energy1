import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { getCurrentContext } from "@/lib/bse/season"

export const dynamic = "force-dynamic"

type TeamRow = { school: string }

/**
 * The FBS team list that powers the board search autocomplete. Derived from
 * hist_raw_games (the ingested season schedule) rather than a live CFBD /teams
 * call, so the suggestion dropdown keeps working when CFBD is rate-limiting.
 * A team is FBS if it appears as an FBS participant on either side of any game
 * this season. Shape matches what TeamSearch expects: { school, abbreviation }.
 */
export async function GET() {
  const ctx = getCurrentContext()

  try {
    const { rows } = await pool.query<TeamRow>(
      `select distinct school from (
         select "homeTeam" as school from hist_raw_games
           where season = $1 and "homeClassification" = 'fbs'
         union
         select "awayTeam" as school from hist_raw_games
           where season = $1 and "awayClassification" = 'fbs'
       ) t
       where school is not null
       order by school asc`,
      [ctx.season],
    )

    const teams = rows.map((r) => ({
      school: r.school,
      abbreviation: null,
      classification: "fbs" as const,
    }))

    return NextResponse.json({
      ok: true,
      totalReturned: teams.length,
      fbsCount: teams.length,
      teams,
    })
  } catch (error) {
    console.error("CFBD teams failed:", error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
