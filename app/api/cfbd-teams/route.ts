import { NextResponse } from "next/server"
import { getCfbdTeams } from "@/lib/cfbd"

export async function GET() {
try {
const teams = await getCfbdTeams()

return NextResponse.json({
ok: true,
count: Array.isArray(teams) ? teams.length : 0,
teams,
})
} catch (error) {
console.error("CFBD teams test failed:", error)

return NextResponse.json(
{
ok: false,
error: error instanceof Error ? error.message : "Unknown error",
},
{ status: 500 }
)
}
}
