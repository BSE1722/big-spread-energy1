"use client"

import { useState } from "react"
import { Loader2, ExternalLink } from "lucide-react"
import { createBillingPortalSession } from "@/app/actions/stripe"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Opens the Stripe-hosted Billing Portal. Cancel / update card / invoices all
 * live there — we never reimplement them. If the user has no Stripe customer
 * yet (never subscribed), the action returns null and we route to pricing.
 */
export function ManageBillingButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openPortal() {
    setLoading(true)
    setError(null)
    try {
      const url = await createBillingPortalSession()
      if (url) {
        window.location.href = url
      } else {
        // No billing account yet → send them to upgrade.
        window.location.href = "/pricing"
      }
    } catch {
      setError("Could not open the billing portal. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className={cn(
          buttonVariants({ variant: "default" }),
          "h-11 font-display font-semibold uppercase tracking-wide",
        )}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Opening…
          </>
        ) : (
          <>
            Manage Subscription <ExternalLink className="size-4" />
          </>
        )}
      </button>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
