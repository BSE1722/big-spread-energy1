import { NextRequest, NextResponse } from "next/server"
import { getCfbdGames } from "@/lib/cfbd"

export async function GET(request: NextRequest) {
try {
const team = request.nextUrl.searchParams.get("team")

if (!team) {
return NextResponse.json(
{ ok: false, error: "Missing team parameter" },
{ status: 400 }
)
}

const games = await getCfbdGames({
year: 2026,
seasonType: "regular",
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
