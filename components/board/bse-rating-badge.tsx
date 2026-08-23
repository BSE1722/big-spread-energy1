import { ratingDisplay } from "@/lib/bse/rating-display"
import { cn } from "@/lib/utils"

interface BseRatingBadgeProps {
  rating: number | null | undefined
  /** Visual size. lg is used on the featured/detail surfaces. */
  size?: "sm" | "md" | "lg"
  className?: string
}

/**
 * The numeric BSE Rating (0–100) — one of the strongest elements on each card.
 * Green 80–100, yellow 60–79, red 0–59. Renders "—" (no label) when the model
 * has no real rating yet. Never renders stars.
 */
export function BseRatingBadge({ rating, size = "md", className }: BseRatingBadgeProps) {
  const display = ratingDisplay(rating)

  const numberSize =
    size === "lg" ? "text-6xl" : size === "sm" ? "text-2xl" : "text-4xl"
  const labelSize = size === "lg" ? "text-xs" : "text-[0.625rem]"

  if (!display) {
    return (
      <div className={cn("flex flex-col items-center", className)} aria-label="BSE Rating not available">
        <span className={cn("font-display font-bold leading-none text-muted-foreground/50", numberSize)}>
          &mdash;
        </span>
        <span className={cn("mt-1 font-mono uppercase tracking-widest text-muted-foreground/50", labelSize)}>
          No rating
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn("flex flex-col items-center", className)}
      aria-label={`BSE Rating ${rating} out of 100, ${display.label}`}
    >
      <span
        className={cn(
          "font-display font-bold leading-none tabular-nums",
          numberSize,
          display.colorClass,
          display.band === "strong" && "text-glow",
        )}
      >
        {rating}
      </span>
      <span
        className={cn(
          "mt-1 font-mono font-semibold uppercase tracking-widest",
          labelSize,
          display.colorClass,
        )}
      >
        {display.label}
      </span>
    </div>
  )
}
