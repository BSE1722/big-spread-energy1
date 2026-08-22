import { NextRequest, NextResponse } from "next/server"
import { getCfbdGames } from "@/lib/cfbd"
import { getCurrentContext } from "@/lib/bse/season"

export async function GET(request: NextRequest) {
try {
const team = request.nextUrl.searchParams.get("team")

if (!team) {
return NextResponse.json(
{ ok: false, error: "Missing team parameter" },
{ status: 400 }
)
}

const ctx = getCurrentContext()

const games = await getCfbdGames({
year: ctx.season,
seasonType: ctx.seasonType,
team,
})

return NextResponse.json({
ok: true,
team,
count: Array.isArray(games) ? games.length : 0,
games,
})
} catch (error) {
console.error("CFBD team games failed:", error)

return NextResponse.json(
{
ok: false,
error: error instanceof Error ? error.message : "Unknown error",
},
{ status: 500 }
)
}
}
