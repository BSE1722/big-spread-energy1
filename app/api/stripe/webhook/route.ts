import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { db } from "@/lib/db"
import { processedStripeEvents } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import {
  syncSubscriptionFromStripe,
  markSubscriptionDeleted,
  recordPaymentHistory,
} from "@/lib/subscription-sync"

/**
 * Stripe webhook — the authoritative reconciliation of BSE Pro status.
 *
 * SECURITY (fail-closed):
 *   - STRIPE_WEBHOOK_SECRET MUST be set. If it is not, we reject every request
 *     with 500 and process nothing. We NEVER parse an unverified body — doing
 *     so would let anyone forge a "payment succeeded" event and grant Pro.
 *   - Every request must carry a valid Stripe signature or it is rejected 400.
 *
 * IDEMPOTENCY:
 *   - Stripe delivers at-least-once. We record each handled event id in
 *     processed_stripe_events and skip anything already recorded, so retries
 *     and duplicates never double-apply a lifecycle change.
 *
 * All subscription state is derived by re-reading the Stripe subscription via
 * syncSubscriptionFromStripe(), so local state always mirrors Stripe.
 */
export const dynamic = "force-dynamic"

const RELEVANT = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
])

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  // Fail closed: no secret => we cannot trust anything. Reject.
  if (!secret) {
    console.log("[v0] stripe webhook rejected: STRIPE_WEBHOOK_SECRET not configured")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  const body = await req.text()
  const sig = req.headers.get("stripe-signature")
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    // Signature invalid/expired/tampered — reject, never process.
    console.log("[v0] stripe webhook signature verification failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }

  if (!RELEVANT.has(event.type)) {
    return NextResponse.json({ received: true, ignored: true })
  }

  // Idempotency guard: if we've already processed this event id, no-op.
  const already = await db
    .select({ id: processedStripeEvents.id })
    .from(processedStripeEvents)
    .where(eq(processedStripeEvents.id, event.id))
    .limit(1)
  if (already[0]) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    await handleEvent(event)
  } catch (err) {
    // Do NOT record the event as processed, so Stripe retries it.
    console.log("[v0] stripe webhook handler error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }

  // Mark processed only after successful handling.
  await db
    .insert(processedStripeEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()

  return NextResponse.json({ received: true })
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      const subId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null
      if (!subId) return
      // Re-read the subscription and mirror its true state. We also stamp the
      // userId into subscription metadata so future subscription.* events for
      // this sub resolve to the right local user.
      const userId = session.metadata?.userId ?? session.client_reference_id ?? null
      if (userId) {
        await stripe.subscriptions.update(subId, { metadata: { userId } }).catch(() => {})
      }
      const sub = await stripe.subscriptions.retrieve(subId)
      await syncSubscriptionFromStripe(sub)
      return
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      // Covers renewals (period advanced), plan changes, cancel-at-period-end
      // toggles, and past_due/unpaid status transitions.
      const sub = event.data.object as Stripe.Subscription
      await syncSubscriptionFromStripe(sub)
      return
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      await markSubscriptionDeleted(sub)
      await recordPaymentHistory({
        userId: sub.metadata?.userId ?? null,
        stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
        stripeEventId: event.id,
        type: "subscription.canceled",
        status: "canceled",
        description: "Subscription canceled",
        occurredAt: new Date(event.created * 1000),
      })
      return
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice
      // Keep local state fresh on renewal, then log the payment.
      const subId =
        typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id ?? null
      let userId: string | null = null
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId)
        const res = await syncSubscriptionFromStripe(sub)
        userId = res.userId
      }
      await recordPaymentHistory({
        userId,
        stripeCustomerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null,
        stripeInvoiceId: invoice.id,
        stripeEventId: event.id,
        type: "invoice.paid",
        status: "paid",
        amount: invoice.amount_paid,
        currency: invoice.currency,
        description: invoice.billing_reason ?? "Invoice paid",
        periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
        occurredAt: new Date(event.created * 1000),
      })
      return
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice
      // Mirror Stripe's resulting status (usually past_due) so access reflects
      // reality; Stripe keeps the sub until its dunning settings expire it,
      // at which point subscription.updated -> unpaid/canceled arrives.
      const subId =
        typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id ?? null
      let userId: string | null = null
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId)
        const res = await syncSubscriptionFromStripe(sub)
        userId = res.userId
      }
      await recordPaymentHistory({
        userId,
        stripeCustomerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null,
        stripeInvoiceId: invoice.id,
        stripeEventId: event.id,
        type: "invoice.payment_failed",
        status: "failed",
        amount: invoice.amount_due,
        currency: invoice.currency,
        description: "Invoice payment failed",
        occurredAt: new Date(event.created * 1000),
      })
      return
    }
  }
}
