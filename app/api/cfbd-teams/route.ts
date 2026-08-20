import { NextResponse } from "next/server"
import { getCfbdGames } from "@/lib/cfbd"

export async function GET() {
try {
const games = await getCfbdGames({
year: 2026,
week: 1,
seasonType: "regular",
division: "fbs",
})

return NextResponse.json({
ok: true,
count: Array.isArray(games) ? games.length : 0,
sample: Array.isArray(games) ? games.slice(0, 5) : games,
})
} catch (error) {
console.error("CFBD test failed:", error)

return NextResponse.json(
{
ok: false,
error: error instanceof Error ? error.message : "Unknown error",
},
{ status: 500 }
)
}
}
