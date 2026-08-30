import Link from "next/link"
import { BarChart3, Crown, Lock, Sparkles, TrendingUp } from "lucide-react"
import type { AccessTier } from "@/lib/access"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const WHAT_BSE_SEES: { icon: typeof Lock; label: string; hint: string }[] = [
  { icon: TrendingUp, label: "BSE Fair Spread", hint: "The model's spread estimate for this game" },
  { icon: BarChart3, label: "Model Edge", hint: "The model's edge vs. the market line" },
  { icon: TrendingUp, label: "Line Movement", hint: "Opening to current movement" },
  { icon: BarChart3, label: "Signal Strength", hint: "A 0–100 read on the model's lean" },
]

/**
 * The gated view of a breakdown. NO premium values are present here — the
 * server never sent them. This is a curiosity/upgrade surface whose exact copy
 * depends on why the viewer is locked out.
 */
export function BreakdownLocked({
  tier,
  canUnlockThisWeek,
  usedOtherGame,
  gameId,
}: {
  tier: AccessTier
  canUnlockThisWeek: boolean
  usedOtherGame: boolean
  gameId: string
}) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      {/* Teased list */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-sm font-bold uppercase tracking-widest text-primary">
          What BSE sees
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Unlock the full BSE breakdown for this matchup — the model&apos;s spread read plus market
          intelligence. Model signals are under live 2026 validation.
        </p>
        <ul className="mt-5 flex flex-col divide-y divide-border">
          {WHAT_BSE_SEES.map(({ icon: Icon, label, hint }) => (
            <li key={label} className="flex items-center justify-between gap-4 py-3">
              <div className="flex items-center gap-3">
                <Icon className="size-4 text-muted-foreground" />
                <div>
                  <p className="font-display text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
              </div>
              <Lock className="size-4 shrink-0 text-muted-foreground" />
            </li>
          ))}
        </ul>
      </section>

      {/* Contextual CTA */}
      <aside className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <LockCta tier={tier} canUnlockThisWeek={canUnlockThisWeek} usedOtherGame={usedOtherGame} gameId={gameId} />
      </aside>
    </div>
  )
}

function LockCta({
  tier,
  canUnlockThisWeek,
  usedOtherGame,
  gameId,
}: {
  tier: AccessTier
  canUnlockThisWeek: boolean
  usedOtherGame: boolean
  gameId: string
}) {
  const primaryBtn = cn(
    buttonVariants({ variant: "default" }),
    "min-h-12 w-full gap-2 font-display font-semibold uppercase tracking-wide",
  )

  // Guest → get them into a free account first (no paywall yet).
  if (tier === "guest") {
    return (
      <>
        <div className="inline-flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h3 className="font-display text-lg font-bold text-foreground">Want to see what BSE sees?</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Create a free Rookie account and unlock 1 complete BSE game analysis every week. No credit card
          required.
        </p>
        <Link href={`/signup?next=${encodeURIComponent(`/game/${gameId}`)}`} className={primaryBtn}>
          Create free account
        </Link>
        <Link
          href={`/login?next=${encodeURIComponent(`/game/${gameId}`)}`}
          className="text-center font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          Already have an account? Log in
        </Link>
      </>
    )
  }

  // Rookie who still has this week's breakdown available (they landed here
  // directly) → point them back to the Board to spend it deliberately.
  if (tier === "rookie" && canUnlockThisWeek) {
    return (
      <>
        <div className="inline-flex items-center gap-2">
          <Lock className="size-5 text-primary" />
          <h3 className="font-display text-lg font-bold text-foreground">Your free breakdown is available</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Rookie members get 1 complete BSE breakdown every week. Head to the Board and choose the game you
          want — it resets Monday.
        </p>
        <Link href="/board" className={primaryBtn}>
          Choose on the Board
        </Link>
      </>
    )
  }

  // Rookie who already used it this week → primary conversion moment.
  return (
    <>
      <div className="inline-flex items-center gap-2">
        <Crown className="size-5 text-primary" />
        <h3 className="font-display text-lg font-bold text-foreground">
          {usedOtherGame ? "You've used this week's free breakdown" : "Go Pro for full access"}
        </h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Your Rookie breakdown resets Monday. Upgrade to BSE Pro to analyze every game on the Board right now.
      </p>
      <Link href="/pricing" className={primaryBtn}>
        <Crown className="size-4" />
        Unlock every game — BSE Pro
      </Link>
    </>
  )
}
