import { getApTop25 } from "@/lib/bse"
import { TeamLogo } from "@/components/team-logo"

/**
 * AP Top 25 poll (ESPN / Associated Press). Sourced from the centralized team
 * registry so ranks stay in sync with the rest of the site — update the poll in
 * one place (`lib/bse/teams.ts`) and every ranking display updates.
 */
export function RatingsTable() {
  const rows = getApTop25()

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          AP Top 25
        </h3>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Associated Press
        </span>
      </div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-card/50 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">#</th>
            <th className="px-4 py-2.5 font-medium">Team</th>
            <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Record</th>
            <th className="px-4 py-2.5 text-right font-medium">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.abbr} className="bg-background transition-colors hover:bg-card">
              <td className="px-4 py-3 font-mono text-sm font-semibold tabular-nums text-foreground">
                {r.rank}
              </td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2">
                  <TeamLogo name={r.name} abbr={r.abbr} size="sm" />
                  <span className="font-display text-sm font-semibold text-foreground">
                    {r.name}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{r.abbr}</span>
                  {r.firstPlaceVotes ? (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      ({r.firstPlaceVotes})
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="hidden px-4 py-3 text-right font-mono text-sm text-foreground/80 sm:table-cell">
                {r.record}
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-foreground/80">
                {r.points.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
