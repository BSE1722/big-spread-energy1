import { bseRatings } from "@/lib/data"
import { RatingMeter } from "@/components/rating-meter"
import { TrendIcon } from "@/components/board/board-view"
import { TeamLogo } from "@/components/team-logo"

export function RatingsTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          BSE Top 25 Ratings
        </h3>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          0–100 scale
        </span>
      </div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-card/50 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">#</th>
            <th className="px-4 py-2.5 font-medium">Team</th>
            <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Off</th>
            <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Def</th>
            <th className="px-4 py-2.5 font-medium">Rating</th>
            <th className="px-4 py-2.5 text-center font-medium">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {bseRatings.map((r) => (
            <tr key={r.abbr} className="bg-background transition-colors hover:bg-card">
              <td className="px-4 py-3 font-mono text-sm text-muted-foreground">{r.rank}</td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2">
                  <TeamLogo name={r.team} abbr={r.abbr} size="sm" />
                  <span className="font-display text-sm font-semibold text-foreground">
                    {r.team}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{r.abbr}</span>
                </span>
              </td>
              <td className="hidden px-4 py-3 text-right font-mono text-sm text-foreground/80 sm:table-cell">
                {r.offense.toFixed(1)}
              </td>
              <td className="hidden px-4 py-3 text-right font-mono text-sm text-foreground/80 sm:table-cell">
                {r.defense.toFixed(1)}
              </td>
              <td className="px-4 py-3">
                <RatingMeter value={r.rating} label={r.rating.toFixed(1)} className="w-28 sm:w-36" />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-center">
                  <TrendIcon trend={r.trend} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
