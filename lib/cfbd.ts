const CFBD_BASE_URL = "https://api.collegefootballdata.com"

function getHeaders() {
const apiKey = process.env.CFBD_API_KEY

if (!apiKey) {
throw new Error("CFBD_API_KEY is not configured")
}

return {
Authorization: `Bearer ${apiKey}`,
Accept: "application/json",
}
}

export async function getCfbdGames(params: {
year: number
week?: number
seasonType?: "regular" | "postseason"
division?: "fbs" | "fcs"
  team?: string
}) {
const search = new URLSearchParams({
year: String(params.year),
})

if (params.week) search.set("week", String(params.week))
if (params.seasonType) search.set("seasonType", params.seasonType)
if (params.division) search.set("division", params.division)
if (params.team) search.set("team", params.team)
const response = await fetch(
`${CFBD_BASE_URL}/games?${search.toString()}`,
{
headers: getHeaders(),
next: { revalidate: 3600 },
}
)

if (!response.ok) {
throw new Error(
`CFBD games request failed: ${response.status} ${response.statusText}`
)
}

return response.json()
}

export async function getCfbdTeams() {
const response = await fetch(`${CFBD_BASE_URL}/teams`, {
headers: getHeaders(),
next: { revalidate: 86400 },
})

if (!response.ok) {
throw new Error(
`CFBD teams request failed: ${response.status} ${response.statusText}`
)
}

return response.json()
}
