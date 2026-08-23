/**
 * Venue resolution: map a game's CFBD venue_id to REAL stadium coordinates,
 * dome flag, and timezone — never the team's home city.
 *
 * CFBD /venues is static reference data, so we cache it in Neon (`venues`) and
 * refresh it rarely. Weather ingestion reads coordinates from here.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { venues } from "@/lib/db/schema"
import { getCfbdVenues } from "@/lib/cfbd"

export interface ResolvedVenue {
  id: number
  name: string | null
  city: string | null
  state: string | null
  timezone: string | null
  latitude: number | null
  longitude: number | null
  elevation: number | null
  dome: boolean
}

/** Raw CFBD venue — field names vary across API versions, so read defensively. */
interface CfbdVenueRaw {
  id: number
  name?: string | null
  city?: string | null
  state?: string | null
  country_code?: string | null
  countryCode?: string | null
  timezone?: string | null
  latitude?: number | null
  longitude?: number | null
  elevation?: number | string | null
  dome?: boolean | null
  grass?: boolean | null
  capacity?: number | null
  /** Older CFBD shape: location.x = longitude, location.y = latitude. */
  location?: { x?: number | null; y?: number | null } | null
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : null
}

function extractCoords(v: CfbdVenueRaw): { lat: number | null; lon: number | null } {
  const lat = num(v.latitude) ?? num(v.location?.y)
  const lon = num(v.longitude) ?? num(v.location?.x)
  return { lat, lon }
}

/**
 * Pull CFBD /venues and upsert them into Neon. Idempotent; safe to run anytime.
 * Returns how many venues were written.
 */
export async function syncVenues(): Promise<{ synced: number }> {
  const raw = (await getCfbdVenues()) as CfbdVenueRaw[]
  const list = Array.isArray(raw) ? raw : []
  let synced = 0

  for (const v of list) {
    if (v?.id == null) continue
    const { lat, lon } = extractCoords(v)
    await db
      .insert(venues)
      .values({
        id: v.id,
        name: v.name ?? null,
        city: v.city ?? null,
        state: v.state ?? null,
        countryCode: v.country_code ?? v.countryCode ?? null,
        timezone: v.timezone ?? null,
        latitude: lat,
        longitude: lon,
        elevation: num(v.elevation),
        dome: Boolean(v.dome),
        grass: v.grass ?? null,
        capacity: v.capacity ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: venues.id,
        set: {
          name: sql`excluded.name`,
          city: sql`excluded.city`,
          state: sql`excluded.state`,
          countryCode: sql`excluded.country_code`,
          timezone: sql`excluded.timezone`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          elevation: sql`excluded.elevation`,
          dome: sql`excluded.dome`,
          grass: sql`excluded.grass`,
          capacity: sql`excluded.capacity`,
          updatedAt: sql`now()`,
        },
      })
    synced++
  }

  return { synced }
}

/** How many venues are currently cached. */
export async function venueCount(): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(venues)
  return rows[0]?.n ?? 0
}

/** Ensure the venue cache is populated; sync on first use. */
export async function ensureVenues(): Promise<void> {
  if ((await venueCount()) === 0) {
    await syncVenues()
  }
}

/** Look up one resolved venue by CFBD id (null when unknown). */
export async function getVenueById(id: number): Promise<ResolvedVenue | null> {
  const rows = await db
    .select()
    .from(venues)
    .where(sql`${venues.id} = ${id}`)
    .limit(1)
  const v = rows[0]
  if (!v) return null
  return {
    id: v.id,
    name: v.name,
    city: v.city,
    state: v.state,
    timezone: v.timezone,
    latitude: v.latitude,
    longitude: v.longitude,
    elevation: v.elevation,
    dome: v.dome,
  }
}
