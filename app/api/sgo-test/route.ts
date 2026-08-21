import { NextResponse } from "next/server"

// Temporary diagnostic endpoint for validating the SportsGameOdds connection
// from the actual Vercel deployment (where SGO_API is populated).
// It NEVER returns the API key — only presence, length, and connection facts.
// Safe to delete once the integration is confirmed.

export const dynamic = "force-dynamic"

const SGO_BASE_URL = "https://api.sportsgameodds.com/v2"

export async function GET() {
  const apiKey = process.env.SGO_API ?? ""
  const keyExists = apiKey.length > 0
  const keyLength = apiKey.length

  // Never proceed (or leak anything) if the key is missing.
  if (!keyExists) {
    return NextResponse.json({
      ok: false,
      sgoApiExists: false,
      sgoApiLength: 0,
      note: "SGO_API is not present in this runtime environment.",
    })
  }

  try {
    // NCAAF events with DraftKings odds available.
    const url =
      `${SGO_BASE_URL}/events?leagueID=NCAAF&bookmakerID=draftkings` +
      `&oddsAvailable=true&limit=25`

    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    })

    const httpStatus = response.status

    let events: unknown[] = []
    let draftkingsFound = false

    if (response.ok) {
      const payload = await response.json()
      const data = Array.isArray(payload?.data) ? payload.data : []
      events = data

      // Detect DraftKings anywhere in the odds tree:
      // Event.odds[oddID].byBookmaker.draftkings
      draftkingsFound = data.some((event: any) => {
        const odds = event?.odds
        if (!odds || typeof odds !== "object") return false
        return Object.values(odds).some((odd: any) =>
          Boolean(odd?.byBookmaker?.draftkings),
        )
      })
    }

    return NextResponse.json({
      ok: response.ok,
      sgoApiExists: true,
      sgoApiLength: keyLength,
      sgoHttpStatus: httpStatus,
      ncaafEventCount: events.length,
      draftkingsDataPresent: draftkingsFound,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sgoApiExists: true,
        sgoApiLength: keyLength,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
