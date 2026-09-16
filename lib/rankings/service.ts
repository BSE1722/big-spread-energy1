import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { appConfig } from "@/lib/db/schema"
import { resolveAbbr, type ApPollEntry } from "@/lib/bse"

/**
 * AP Top 25 ingestion + storage.
 *
 * The poll is fetched from ESPN's public college-football rankings endpoint
 * (no API key, not subject to the CFBD rate limit) and stored as a single JSON
 * row in `app_config` under `ap_top_25`. Readers (the /api/ap-rankings route)
 * fall back to the hard-coded seed in lib/bse/teams.ts when the row is absent,
 * so ranks always render even before the first refresh.
 *
 * This is freshness infrastructure ONLY — ranks are cosmetic (the "#6" badge).
 * Nothing here touches a BSE Rating, fair line, edge, or the odds snapshot.
 */

const AP_POLL_KEY = "ap_top_25"
const ESPN_RANKINGS_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings"

export interface StoredApPoll {
  season: number | null
  week: number | null
  updatedAt: string
  poll: ApPollEntry[]
}

/** Fetch and normalize the current AP Top 25 from ESPN into ApPollEntry rows. */
export async function fetchApPollFromEspn(): Promise<{
  season: number | null
  week: number | null
  poll: ApPollEntry[]
}> {
  const res = await fetch(ESPN_RANKINGS_URL, { cache: "no-store" })
  if (!res.ok) throw new Error(`ESPN rankings request failed: ${res.status} ${res.statusText}`)
  const json = (await res.json()) as {
    season?: { year?: number }
    latestWeek?: { number?: number }
    rankings?: Array<{
      name?: string
      occurrence?: { number?: number }
      ranks?: Array<{
        current?: number
        points?: number
        firstPlaceVotes?: number
        recordSummary?: string
        team?: { abbreviation?: string; location?: string; displayName?: string }
      }>
    }>
  }

  const ap = (json.rankings ?? []).find((r) => /AP Top 25/i.test(r?.name ?? "")) ?? json.rankings?.[0]
  if (!ap?.ranks?.length) throw new Error("ESPN rankings response did not contain an AP poll")

  const poll: ApPollEntry[] = []
  for (const r of ap.ranks) {
    const abbr =
      resolveAbbr(r.team?.abbreviation) ??
      resolveAbbr(r.team?.location) ??
      resolveAbbr(r.team?.displayName)
    if (!abbr || typeof r.current !== "number") continue // skip anything we can't map to our registry
    poll.push({
      rank: r.current,
      abbr,
      points: r.points ?? 0,
      firstPlaceVotes: r.firstPlaceVotes || undefined,
      record: r.recordSummary ?? "",
    })
  }

  return {
    season: json.season?.year ?? null,
    week: ap.occurrence?.number ?? json.latestWeek?.number ?? null,
    poll,
  }
}

/**
 * Fetch the current AP poll and persist it. Refuses to overwrite the stored
 * poll with a suspiciously small result (a partial/garbled ESPN response), so a
 * bad fetch can never blank out good ranks.
 */
export async function refreshApPoll(): Promise<StoredApPoll> {
  const { season, week, poll } = await fetchApPollFromEspn()
  if (poll.length < 20) {
    throw new Error(`Refusing to store AP poll with only ${poll.length} mapped teams`)
  }

  const stored: StoredApPoll = {
    season,
    week,
    updatedAt: new Date().toISOString(),
    poll,
  }

  await db
    .insert(appConfig)
    .values({ key: AP_POLL_KEY, value: stored, updatedAt: new Date(), updatedBy: "cron:refresh-rankings" })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: stored, updatedAt: new Date(), updatedBy: "cron:refresh-rankings" },
    })

  return stored
}

/** Read the stored AP poll, or null when it has never been ingested. */
export async function getStoredApPoll(): Promise<StoredApPoll | null> {
  try {
    const rows = await db
      .select({ value: appConfig.value })
      .from(appConfig)
      .where(eq(appConfig.key, AP_POLL_KEY))
      .limit(1)
    const raw = rows[0]?.value as StoredApPoll | undefined
    if (!raw || !Array.isArray(raw.poll) || raw.poll.length === 0) return null
    return raw
  } catch (err) {
    console.error("[v0] getStoredApPoll failed:", err)
    return null
  }
}
