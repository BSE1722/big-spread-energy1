import { cn } from "@/lib/utils"

export function RatingMeter({
  value,
  label,
  className,
}: {
  value: number
  label?: string
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-xs font-semibold text-foreground">
        {label ?? value.toFixed(0)}
      </span>
    </div>
  )
}
