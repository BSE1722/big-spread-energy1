"use client"

import Link from "next/link"
import { Lock, UserPlus, Sparkles, Infinity as InfinityIcon } from "lucide-react"
import type { ToolUsageInfo } from "@/lib/tools/types"

/**
 * Shared gating chrome for the two BSE tools (analyzer + Getting Parlaid).
 * Renders the correct state — guest create-account prompt, free remaining
 * meter, at-limit lock + Upgrade CTA, or Pro unlimited note — and only exposes
 * the run action (its `children`) when a run is actually allowed. Tier + usage
 * come from the server (useAccess / useToolUsage); this never decides access on
 * its own, it only mirrors the server truth.
 */

export type GateMode = "loading" | "guest" | "ready" | "locked"

export function toolGateMode(a: {
  loading: boolean
  isGuest: boolean
  isPro: boolean
  usage: ToolUsageInfo | null
}): GateMode {
  if (a.loading) return "loading"
  if (a.isGuest) return "guest"
  if (a.isPro) return "ready"
  if (a.usage && a.usage.remaining > 0) return "ready"
  if (!a.usage) return "loading"
  return "locked"
}

export function ToolGate({
  mode,
  usage,
  isPro,
  labels,
  children,
}: {
  mode: GateMode
  usage: ToolUsageInfo | null
  isPro: boolean
  labels: { singular: string; plural: string }
  /** The run button, shown only when a run is allowed. */
  children?: React.ReactNode
}) {
  if (mode === "loading") {
    return <div className="h-12 animate-pulse rounded-lg border border-border bg-secondary/40" aria-hidden="true" />
  }

  if (mode === "guest") {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
        <p className="flex items-center justify-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          <UserPlus className="size-4 text-primary" />
          Create your free BSE account to continue
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          {`A free account unlocks BSE's tools each week. No card required.`}
        </p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
          >
            Create free account
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            Log in
          </Link>
        </div>
      </div>
    )
  }

  if (mode === "locked") {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="flex items-center justify-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          <Lock className="size-4 text-muted-foreground" />
          {`You've used all ${usage?.limit ?? 0} free ${usage?.limit === 1 ? labels.singular : labels.plural} this week`}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Your free {labels.plural} reset next week. Go unlimited with BSE Pro — analyze every ticket, every week.
        </p>
        <Link
          href="/pricing"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Sparkles className="size-4" />
          Upgrade to BSE Pro
        </Link>
      </div>
    )
  }

  // ready
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center">
        {isPro ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-primary">
            <InfinityIcon className="size-3.5" />
            BSE Pro — unlimited
          </span>
        ) : usage ? (
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {`${usage.remaining} of ${usage.limit} free ${usage.limit === 1 ? labels.singular : labels.plural} remaining this week`}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}
