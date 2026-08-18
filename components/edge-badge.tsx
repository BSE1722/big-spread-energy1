import { edgeGrade } from "@/lib/data"
import { cn } from "@/lib/utils"

const toneStyles: Record<string, string> = {
  elite: "bg-primary text-primary-foreground",
  strong: "bg-primary/20 text-primary ring-1 ring-inset ring-primary/40",
  lean: "bg-secondary text-foreground ring-1 ring-inset ring-border",
  pass: "bg-transparent text-muted-foreground ring-1 ring-inset ring-border",
}

export function EdgeBadge({ edge, className }: { edge: number; className?: string }) {
  const { label, tone } = edgeGrade(edge)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider",
        toneStyles[tone],
        className,
      )}
    >
      {label}
      <span className="opacity-80">+{edge.toFixed(1)}</span>
    </span>
  )
}
