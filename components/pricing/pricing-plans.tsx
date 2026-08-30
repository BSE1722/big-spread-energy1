"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FREE_FEATURES, PRO_FEATURES } from "@/lib/bse"
import { useAccess } from "@/lib/use-access"
import { ProCheckout } from "@/components/pricing/pro-checkout"

const plans = [
  {
    id: "rookie",
    name: "Rookie",
    tagline: "Get enough edge to understand what you're missing",
    monthly: 0,
    annual: 0,
    cta: "Start free",
    highlight: false,
    features: FREE_FEATURES,
  },
  {
    id: "pro",
    name: "BSE Pro",
    tagline: "The complete BSE betting terminal",
    monthly: 29.99,
    annual: 24,
    cta: "Go Pro",
    highlight: true,
    features: PRO_FEATURES,
  },
  {
    id: "black",
    name: "BSE Black",
    tagline: "The model behind the model",
    monthly: 99.99,
    annual: 82,
    cta: "Contact sales",
    highlight: false,
    features: [
      "Everything in BSE Pro",
      "BSE fair lines",
      "Full model factor scores",
      "Simulation distribution",
      "Confidence / Uncertainty Data",
      "Early BSE Board and behind-the-scenes data",
      "Custom model weighting",
      "Private Black Analytics",
      "Personalized BSE correspondence on future bets",
      "Up to 5 seats",
      "Priority support",
    ],
  },
]

export function PricingPlans() {
  const [annual, setAnnual] = useState(true)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const router = useRouter()
  const { access } = useAccess()

  const tier = access?.tier ?? "guest"
  const interval = annual ? "year" : "month"

  return (
    <div>
      {checkoutOpen && (
        <ProCheckout
          interval={interval}
          onClose={() => {
            setCheckoutOpen(false)
            router.push("/board")
          }}
        />
      )}
      <div className="flex items-center justify-center gap-3">
        <span className={cn("font-mono text-xs uppercase tracking-wide", !annual ? "text-foreground" : "text-muted-foreground")}>
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          onClick={() => setAnnual((v) => !v)}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full border border-border transition-colors",
            annual ? "bg-primary" : "bg-secondary",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-background transition-transform",
              annual ? "translate-x-6" : "translate-x-0.5",
            )}
          />
        </button>
        <span className={cn("font-mono text-xs uppercase tracking-wide", annual ? "text-foreground" : "text-muted-foreground")}>
          Annual
          <span className="ml-1 rounded bg-primary/15 px-1.5 py-0.5 text-primary">-17%</span>
        </span>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = annual ? plan.annual : plan.monthly
          return (
            <div
              key={plan.name}
              className={cn(
                "flex flex-col rounded-2xl border p-6",
                plan.highlight
                  ? "border-primary bg-card shadow-[0_0_60px_-20px_var(--color-primary)]"
                  : "border-border bg-card",
              )}
            >
              {plan.highlight && (
                <span className="mb-4 w-fit rounded-full bg-primary px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
                  Most popular
                </span>
              )}
              <h3 className="font-display text-2xl font-bold uppercase tracking-tight text-foreground">
                {plan.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

              <div className="mt-6 flex items-end gap-1">
                <span className="font-display text-5xl font-bold text-foreground">
                  ${price}
                </span>
                <span className="mb-1.5 font-mono text-xs text-muted-foreground">
                  /mo{annual && price > 0 ? " billed yearly" : ""}
                </span>
              </div>

              <PlanCta
                planId={plan.id}
                label={plan.cta}
                highlight={plan.highlight}
                tier={tier}
                onGoPro={() => setCheckoutOpen(true)}
              />

              <ul className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ctaClass = (highlight: boolean) =>
  cn(
    buttonVariants({ variant: highlight ? "default" : "outline" }),
    "mt-6 h-11 w-full font-display font-semibold uppercase tracking-wide",
  )

function PlanCta({
  planId,
  label,
  highlight,
  tier,
  onGoPro,
}: {
  planId: string
  label: string
  highlight: boolean
  tier: "guest" | "rookie" | "pro"
  onGoPro: () => void
}) {
  // BSE Black — sales-led, not a self-serve Stripe plan.
  if (planId === "black") {
    return (
      <Link href="mailto:hello@bigspreadenergy.com?subject=BSE%20Black" className={ctaClass(highlight)}>
        {label}
      </Link>
    )
  }

  // Rookie (free) plan.
  if (planId === "rookie") {
    if (tier === "guest") {
      return (
        <Link href="/signup" className={ctaClass(highlight)}>
          {label}
        </Link>
      )
    }
    return (
      <Link href="/board" className={ctaClass(highlight)}>
        {tier === "rookie" ? "Your current plan" : "Go to Board"}
      </Link>
    )
  }

  // BSE Pro — Stripe subscription.
  if (tier === "pro") {
    return (
      <Link href="/board" className={ctaClass(highlight)}>
        You&apos;re Pro
      </Link>
    )
  }
  if (tier === "guest") {
    return (
      <Link href={`/signup?next=${encodeURIComponent("/pricing")}`} className={ctaClass(highlight)}>
        {label}
      </Link>
    )
  }
  return (
    <Button onClick={onGoPro} className={ctaClass(highlight)}>
      {label}
    </Button>
  )
}
