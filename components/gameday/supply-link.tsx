import { ArrowUpRight } from "lucide-react"
import { BSE_SUPPLY_URL, isSupplyConfigured } from "@/lib/gameday/config"
import { cn } from "@/lib/utils"

export function SupplyLink({ className }: { className?: string }) {
  return (
    <a
      href={isSupplyConfigured ? BSE_SUPPLY_URL : "#bse-supply"}
      target={isSupplyConfigured ? "_blank" : undefined}
      rel="noopener noreferrer"
      title={isSupplyConfigured ? undefined : "BSE Supply store link coming soon"}
      className={cn(
        "inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-primary px-7 font-display text-lg font-semibold uppercase tracking-wide text-primary-foreground shadow-[0_0_48px_-10px_var(--primary)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary",
        className,
      )}
    >
      Shop BSE Supply
      <ArrowUpRight className="size-5" aria-hidden="true" />
      {isSupplyConfigured && <span className="sr-only">(opens external store in a new tab)</span>}
    </a>
  )
}
