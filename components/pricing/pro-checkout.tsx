"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { startProCheckout, confirmProCheckout } from "@/app/actions/stripe"
import type { BillingInterval } from "@/lib/products"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "")

/**
 * Opens embedded Stripe Checkout for the BSE Pro subscription. Because the
 * session uses `redirect_on_completion: "never"`, we reconcile Pro status via
 * `confirmProCheckout` in the `onComplete` callback (belt-and-suspenders with
 * the webhook), then refresh so the account tier updates everywhere.
 */
export function ProCheckout({
  interval,
  onClose,
}: {
  interval: BillingInterval
  onClose: () => void
}) {
  const router = useRouter()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true
    startProCheckout(interval)
      .then((secret) => {
        if (!active) return
        if (!secret) setError("We couldn't start checkout. Please try again.")
        else setClientSecret(secret)
      })
      .catch(() => active && setError("We couldn't start checkout. Please try again."))
    return () => {
      active = false
    }
  }, [interval])

  const onComplete = useCallback(async () => {
    // Read the session id Stripe appended to the URL fragment/query, falling
    // back to the SDK-provided one if present.
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get("session_id")
    try {
      if (sessionId) await confirmProCheckout(sessionId)
    } catch {
      // Webhook will still reconcile; ignore.
    }
    setDone(true)
    router.refresh()
  }, [router])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to BSE Pro"
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-border bg-card p-1 shadow-2xl">
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="font-display text-lg font-bold uppercase tracking-tight text-foreground">
            {done ? "Welcome to BSE Pro" : "Upgrade to BSE Pro"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="p-3">
          {done ? (
            <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
              <p className="text-pretty text-muted-foreground">
                You&apos;re Pro. Every game on the Board is now fully unlocked.
              </p>
              <Button onClick={onClose} className="font-display font-semibold uppercase tracking-wide">
                Go to the Board
              </Button>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
              <p className="text-pretty text-destructive">{error}</p>
              <Button
                variant="outline"
                onClick={onClose}
                className="font-display font-semibold uppercase tracking-wide"
              >
                Close
              </Button>
            </div>
          ) : clientSecret ? (
            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret, onComplete }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : (
            <div className="flex items-center justify-center py-16">
              <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
