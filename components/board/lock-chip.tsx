import { Lock } from "lucide-react"
import { cn } from "@/lib/utils"

interface LockChipProps {
  label: string
  /** Optional teaser hint, e.g. "+? EDGE". */
  hint?: string
  className?: string
}

/**
 * A tasteful locked-field indicator. Shows that BSE has deeper intelligence
 * without revealing the value — curiosity, not frustration. Used for Fair
 * Spread, Model Edge, Line Movement, Factor Breakdown, Best Line, etc.
 */
export function LockChip({ label, hint, className }: LockChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-1",
        className,
      )}
    >
      {hint ? (
        <span className="font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {hint}
        </span>
      ) : (
        <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      )}
      <Lock className="size-3 text-muted-foreground/70" aria-hidden="true" />
      <span className="sr-only">{label} locked</span>
    </span>
  )
}
