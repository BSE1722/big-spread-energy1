import { NextResponse } from "next/server"
import { getAccessState } from "@/lib/access"

// Returns the current viewer's access state (tier + this week's unlock, if any).
// Client components use this to render the correct lock/unlock UI. It never
// returns premium analysis values — only entitlement metadata.
export async function GET() {
  const state = await getAccessState()
  return NextResponse.json(state, {
    // Per-user, must never be shared in a CDN cache.
    headers: { "Cache-Control": "private, no-store" },
  })
}
