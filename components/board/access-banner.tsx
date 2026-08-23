"use client"

import Link from "next/link"
import { Crown, Lock, Ticket } from "lucide-react"
import type { AccessResponse } from "@/lib/use-access"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The contextual status banner at the top of the Board. Its message depends
 * entirely on the viewer's real access state — never on client guesses:
 *  - guest: invite to create a free Rookie account
 *  - rookie with unlock available: "1 free breakdown available, resets Monday"
 *  - rookie who used it: primary conversion moment → Go Pro
 *  - pro: quiet confirmation, no upsell
 */
export function AccessBanner({
  access,
  loading,
}: {
  access: AccessResponse | null
  loading: boolean
}) {
  if (loading || !access) {
    return <div className="h-16 w-full animate-pulse rounded-xl border border-border bg-card/60" />
  }

  if (access.tier === "pro") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <Crown className="size-5 shrink-0 text-primary" />
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          BSE Pro · Unlimited breakdowns
        </p>
      </div>
    )
  }

  if (access.tier === "guest") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Lock className="size-5 shrink-0 text-primary" />
          <p className="text-pretty text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Everybody gets the BSE Rating.</span>{" "}
            Create a free Rookie account to unlock 1 complete breakdown every week.
          </p>
        </div>
        <Link
          href="/signup"
          className={cn(
            buttonVariants({ variant: "default" }),
            "shrink-0 font-display font-semibold uppercase tracking-wide",
          )}
        >
          Create free account
        </Link>
      </div>
    )
  }

  // Authenticated Rookie with their weekly breakdown still available
  if (access.canUnlockThisWeek) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Ticket className="size-5 shrink-0 text-primary" />
          <p className="text-pretty text-sm text-foreground">
            <span className="font-display font-semibold uppercase tracking-wide">
              Your free BSE breakdown
            </span>
            <span className="text-muted-foreground">
              {" "}
              · 1 available this week. Choose wisely — it resets Monday.
            </span>
          </p>
        </div>
        <Link
          href="/pricing"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "shrink-0 font-display font-semibold uppercase tracking-wide",
          )}
        >
          <Crown className="size-4" />
          Go Pro
        </Link>
      </div>
    )
  }

  // Rookie who already used this week's breakdown — primary conversion moment.
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Lock className="size-5 shrink-0 text-primary" />
        <p className="text-pretty text-sm text-foreground">
          <span className="font-display font-semibold uppercase tracking-wide">
            You&apos;ve used this week&apos;s free breakdown
          </span>
          <span className="text-muted-foreground"> · Resets Monday. Go Pro to analyze every game now.</span>
        </p>
      </div>
      <Link
        href="/pricing"
        className={cn(
          buttonVariants({ variant: "default" }),
          "shrink-0 font-display font-semibold uppercase tracking-wide",
        )}
      >
        <Crown className="size-4" />
        Unlock every game
      </Link>
    </div>
  )
}
