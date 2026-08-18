import { Info } from "lucide-react"
import { MOCK_DATA_LABEL } from "@/lib/bse"

/**
 * Small, clearly-labeled banner so mock/demo values are never mistaken for
 * live sportsbook odds. Reads the single source-of-truth label from the data
 * layer, so when a live feed replaces mock data this can be hidden in one place.
 */
export function DemoDataBanner({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={`flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-muted-foreground ${className ?? ""}`}
    >
      <Info className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="uppercase tracking-wide">{MOCK_DATA_LABEL}</span>
    </div>
  )
}
