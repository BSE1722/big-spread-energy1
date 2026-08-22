import { getTeamRank } from "@/lib/bse"
import { TeamLogo } from "@/components/team-logo"
import { cn } from "@/lib/utils"

type Size = "sm" | "md" | "lg"

/**
 * Canonical way to render a team wherever it appears on the site: logo chip,
 * an AP Top 25 rank prefix (e.g. "#1") when the team is ranked, and the label.
 *
 * The rank is resolved from the centralized team registry by school name or
 * abbreviation, so a team shows the same rank everywhere. Pass `label="abbr"`
 * for compact contexts (mobile cards) or `label="name"` for the full name.
 */
export function TeamName({
  name,
  abbr,
  label = "name",
  size = "sm",
  logo = true,
  className,
  rankClassName,
}: {
  name: string
  abbr: string
  label?: "name" | "abbr"
  size?: Size
  logo?: boolean
  className?: string
  rankClassName?: string
}) {
  const rank = getTeamRank(name) ?? getTeamRank(abbr)
  const text = label === "abbr" ? abbr : name

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {logo && <TeamLogo name={name} abbr={abbr} size={size} />}
      {rank != null && (
        <span
          className={cn(
            "font-mono text-[11px] font-semibold tabular-nums text-primary",
            rankClassName,
          )}
          aria-label={`Ranked number ${rank}`}
        >
          #{rank}
        </span>
      )}
      <span className="font-semibold text-foreground">{text}</span>
    </span>
  )
}
