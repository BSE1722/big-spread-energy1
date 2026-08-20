import { NextResponse } from "next/server"
import { getCfbdTeams } from "@/lib/cfbd"

export async function GET() {
try {
const teams = await getCfbdTeams()

const fbsTeams = Array.isArray(teams)
? teams
.filter((team: any) => team.classification === "fbs")
.sort((a: any, b: any) => a.school.localeCompare(b.school))
: []

return NextResponse.json({
ok: true,
totalReturned: Array.isArray(teams) ? teams.length : 0,
fbsCount: fbsTeams.length,
teams: fbsTeams,
