/**
 * Pure kickoff date/time formatters — no client-only dependencies, so these are
 * safe to import from Server Components (e.g. the game breakdown page). The
 * client board re-exports these from `use-live-board.ts` for convenience.
 */

/** Format an ISO kickoff into the board's "Sat 12:00 PM ET" style. */
export function formatKickoff(iso: string, tbd: boolean): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" })
  if (tbd) return `${day} · TBD`
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  })
  return `${day} ${time} ET`
}

/** Unambiguous day-first date for an ISO kickoff, in ET (e.g. "29 Aug", "5 Sep"). */
export function formatKickoffDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "America/New_York",
  }).formatToParts(new Date(iso))
  const day = parts.find((p) => p.type === "day")?.value ?? "--"
  const month = parts.find((p) => p.type === "month")?.value ?? "--"
  return `${day} ${month}`
}
