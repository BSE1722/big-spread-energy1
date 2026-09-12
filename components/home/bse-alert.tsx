import { Radio, Zap, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * BSE ALERT visual language — ESPN breaking-news graphic meets trading terminal.
 * These are DATA-TRIGGERED only: callers render an alert exclusively when a real
 * BSE signal fires (a market disagreement clearing the gate, a high rating).
 * There is deliberately no "weather"/"line move" tone here because the homepage
 * board feed does not carry that data — we do not surface an alert we can't back.
 */

type AlertTone = "disagreement" | "rating" | "live"

const TONE: Record<
  AlertTone,
  { label: string; icon: typeof Zap; className: string; iconClass: string }
> = {
  disagreement: {
    label: "Market Disagreement",
    icon: Zap,
    className: "border-primary/40 bg-primary/10 text-primary",
    iconClass: "text-primary",
  },
  rating: {
    label: "High BSE Rating",
    icon: TrendingUp,
    className: "border-primary/40 bg-primary/10 text-primary",
    iconClass: "text-primary",
  },
  live: {
    label: "Live BSE Signal",
    icon: Radio,
    className: "border-primary/40 bg-primary/10 text-primary",
    iconClass: "text-primary",
  },
}

export function BseAlert({
  tone,
  label,
  className,
}: {
  tone: AlertTone
  label?: string
  className?: string
}) {
  const meta = TONE[tone]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[0.625rem] font-bold uppercase tracking-[0.14em]",
        meta.className,
        className,
      )}
    >
      <Icon className={cn("h-3 w-3 shrink-0", meta.iconClass)} aria-hidden="true" />
      {label ?? meta.label}
    </span>
  )
}

/** The pulsing "LIVE" dot used across the broadcast-style headers. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)} aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
    </span>
  )
}
