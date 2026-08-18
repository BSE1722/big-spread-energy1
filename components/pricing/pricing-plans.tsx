"use client"

import { useState } from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const plans = [
  {
    name: "Rookie",
    tagline: "For casual Saturday bettors",
    monthly: 0,
    annual: 0,
    cta: "Start free",
    highlight: false,
    features: [
      "The Board — top 5 edges",
      "Weekly BSE Top 25 ratings",
      "Parlay Analyzer (2 legs)",
      "Delayed line updates",
    ],
  },
  {
    name: "BSE Pro",
    tagline: "For serious edge hunters",
    monthly: 29,
    annual: 24,
    cta: "Go Pro",
    highlight: true,
    features: [
      "The Board — every game, every number",
      "Full BSE fair lines & edge scores",
      "Unlimited Parlay Analyzer legs",
      "Getting Parlaid generator",
      "Real-time line movement alerts",
      "Season ROI & bet tracking",
    ],
  },
  {
    name: "Syndicate",
    tagline: "For pros & groups",
    monthly: 99,
    annual: 82,
    cta: "Contact sales",
    highlight: false,
    features: [
      "Everything in BSE Pro",
      "API access to fair lines",
      "Custom model weighting",
      "Up to 5 seats",
      "Priority support",
    ],
  },
]

export function PricingPlans() {
  const [annual, setAnnual] = useState(true)

  return (
    <div>
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

              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ variant: plan.highlight ? "default" : "outline" }),
                  "mt-6 h-11 font-display font-semibold uppercase tracking-wide",
                )}
              >
                {plan.cta}
              </Link>

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
