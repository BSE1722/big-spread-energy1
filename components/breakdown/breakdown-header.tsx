import { Check } from "lucide-react"
import { formatKickoff, formatKickoffDate } from "@/lib/use-live-board"
import { TeamName } from "@/components/team-name"
import { BseRatingBadge } from "@/components/board/bse-rating-badge"

const PLACEHOLDER = "—"

interface HeaderData {
  away: { name: string; abbr: string }
  home: { name: string; abbr: string }
  kickoff: string
  kickoffTBD: boolean
  neutralSite: boolean
  marketSpread: number | null
  marketTotal: number | null
  marketMoneyline: { home: number | null; away: number | null }
  bseRating: number | null
}

function favoredSpread(h: HeaderData): string {
  const s = h.marketSpread
  if (s == null) return PLACEHOLDER
  if (s === 0) return "PK"
  const favAbbr = s < 0 ? h.home.abbr : h.away.abbr
  return `${favAbbr} ${(-Math.abs(s)).toFixed(1)}`
}

/** Public matchup header shown to everyone (matchup, kickoff, market, rating). */
export function BreakdownHeader({
  header,
  unlocked,
  viaRookie,
}: {
  header: HeaderData
  unlocked: boolean
  viaRookie: boolean
}) {
  return (
    <header className="mt-4 rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          {formatKickoffDate(header.kickoff)} · {formatKickoff(header.kickoff, header.kickoffTBD)}
          {header.neutralSite ? " · Neutral site" : ""}
        </span>
        {unlocked && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-primary">
            <Check className="size-3" />
            {viaRookie ? "Your free breakdown this week" : "Unlocked"}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <TeamName name={header.away.name} abbr={header.away.abbr} size="lg" className="text-2xl sm:text-3xl" />
          <span className="font-display text-xs uppercase tracking-widest text-muted-foreground">at</span>
          <TeamName name={header.home.name} abbr={header.home.abbr} size="lg" className="text-2xl sm:text-3xl" />
        </div>

        <div className="flex items-center gap-8">
          <BseRatingBadge rating={header.bseRating} size="lg" />
          <div className="flex flex-col gap-3">
            <Stat label="Spread" value={favoredSpread(header)} />
            <Stat label="Total" value={header.marketTotal != null ? `O/U ${header.marketTotal.toFixed(1)}` : PLACEHOLDER} />
          </div>
        </div>
      </div>
    </header>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-display text-xl font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}
