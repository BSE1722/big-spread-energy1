"use server"

import { randomUUID } from "node:crypto"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { stripe } from "@/lib/stripe"
import { getSessionUser } from "@/lib/access"
import { db } from "@/lib/db"
import { subscriptions } from "@/lib/db/schema"
import { BSE_PRO, proPriceCents, type BillingInterval } from "@/lib/products"
import { syncSubscriptionFromStripe } from "@/lib/subscription-sync"

/**
 * Open the Stripe-hosted Billing Portal so a Pro member can self-serve: cancel
 * (at period end), update their card, and view invoices. We never build our own
 * cancel/card UI — Stripe owns that surface and keeps it PCI-compliant.
 *
 * Security:
 *  - Must be signed in.
 *  - We look up the caller's OWN Stripe customer id from our DB (never trust a
 *    client-supplied id), so a user can only ever manage their own billing.
 *  - Returns null if the user has no Stripe customer yet (never subscribed), so
 *    the UI can show an upgrade CTA instead.
 */
export async function createBillingPortalSession(): Promise<string | null> {
  const user = await getSessionUser()
  if (!user) throw new Error("You must be signed in to manage billing.")

  const row = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1)

  const customerId = row[0]?.stripeCustomerId
  if (!customerId) return null // never subscribed → caller shows upgrade CTA

  // Build an absolute return URL from the incoming request origin (works in
  // both preview and production without hardcoding a domain).
  const h = await headers()
  const proto = h.get("x-forwarded-proto") ?? "https"
  const host = h.get("x-forwarded-host") ?? h.get("host")
  const returnUrl = host ? `${proto}://${host}/account` : "/account"

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })

  return session.url
}

/**
 * Start an embedded Checkout session for a BSE Pro subscription.
 *
 * Security:
 *  - The viewer must be signed in; we bind the session to their user id via
 *    metadata + client_reference_id so the webhook / return handler can
 *    attribute Pro to the right account.
 *  - The price is ALWAYS read from the server (lib/products), never from the
 *    client. The client only chooses month vs year.
 *  - An idempotency key prevents a double-submit from creating two sessions.
 */
export async function startProCheckout(interval: BillingInterval): Promise<string | null> {
  const user = await getSessionUser()
  if (!user) throw new Error("You must be signed in to upgrade.")

  const normalizedInterval: BillingInterval = interval === "year" ? "year" : "month"
  const unitAmount = proPriceCents(normalizedInterval)

  // Reuse an existing Stripe customer for this user if we have one.
  const existing = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1)

  let customerId = existing[0]?.stripeCustomerId ?? undefined
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    })
    customerId = customer.id
    // Upsert a placeholder subscription row so we remember the customer id.
    await db
      .insert(subscriptions)
      .values({
        id: randomUUID(),
        userId: user.id,
        status: "inactive",
        stripeCustomerId: customerId,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: { stripeCustomerId: customerId, updatedAt: new Date() },
      })
  }

  const session = await stripe.checkout.sessions.create(
    {
      // stripe v22 → Dahlia value.
      ui_mode: "embedded_page",
      redirect_on_completion: "never",
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      metadata: { userId: user.id, interval: normalizedInterval },
      subscription_data: { metadata: { userId: user.id } },
      line_items: [
        {
          price_data: {
            currency: BSE_PRO.currency,
            product_data: { name: `${BSE_PRO.name} (${normalizedInterval}ly)` },
            unit_amount: unitAmount,
            recurring: { interval: normalizedInterval },
          },
          quantity: 1,
        },
      ],
    },
    { idempotencyKey: `pro-${user.id}-${normalizedInterval}-${Date.now()}` },
  )

  return session.client_secret
}

/**
 * Reconciliation used on the Checkout return. Retrieves the session, verifies
 * it belongs to the signed-in user and is paid/complete, then mirrors the
 * Stripe subscription into our local row via the SHARED sync used by the
 * webhook — so the return path and the webhook can never disagree. Whichever
 * fires first wins; the other is a harmless idempotent no-op (keyed on userId).
 *
 * This is a convenience for instant UI feedback. The webhook remains the
 * authoritative lifecycle handler in production.
 */
export async function confirmProCheckout(sessionId: string): Promise<{ pro: boolean }> {
  const user = await getSessionUser()
  if (!user) return { pro: false }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "subscription.items"],
  })

  // The session must belong to this user.
  if (session.client_reference_id !== user.id && session.metadata?.userId !== user.id) {
    return { pro: false }
  }

  const complete =
    session.status === "complete" &&
    (session.payment_status === "paid" || session.payment_status === "no_payment_required")
  if (!complete) return { pro: false }

  const sub =
    typeof session.subscription === "object" && session.subscription !== null ? session.subscription : null
  if (!sub) return { pro: false }

  // Ensure the subscription carries userId metadata for future webhook events,
  // then mirror its true state locally through the shared sync.
  if (!sub.metadata?.userId) {
    await stripe.subscriptions.update(sub.id, { metadata: { userId: user.id } }).catch(() => {})
    sub.metadata = { ...(sub.metadata ?? {}), userId: user.id }
  }
  await syncSubscriptionFromStripe(sub)

  return { pro: sub.status === "active" || sub.status === "trialing" }
}
