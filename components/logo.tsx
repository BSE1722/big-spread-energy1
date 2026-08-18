import Link from "next/link"
import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2.5", className)} aria-label="Big Spread Energy home">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary font-display text-lg font-bold leading-none text-primary-foreground shadow-[0_0_20px_-4px_var(--color-primary)]">
        BSE
      </span>
      <span className="hidden flex-col leading-none sm:flex">
        <span className="font-display text-base font-bold tracking-tight text-foreground">
          BIG SPREAD ENERGY
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          CFB Analytics Terminal
        </span>
      </span>
    </Link>
  )
}
