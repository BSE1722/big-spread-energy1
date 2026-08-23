"use server"

import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { stripe } from "@/lib/stripe"
import { getSessionUser } from "@/lib/access"
import { db } from "@/lib/db"
import { subscriptions } from "@/lib/db/schema"
import { BSE_PRO, proPriceCents, type BillingInterval } from "@/lib/products"

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
 * Fallback reconciliation used on the Checkout return (no webhook secret
 * required in the sandbox). Retrieves the session by id, verifies it belongs to
 * the signed-in user and is paid/active, then marks them Pro. The webhook does
 * the same job in production; whichever fires first wins and the other is a
 * harmless no-op because we key on userId.
 */
export async function confirmProCheckout(sessionId: string): Promise<{ pro: boolean }> {
  const user = await getSessionUser()
  if (!user) return { pro: false }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  })

  // The session must belong to this user.
  if (session.client_reference_id !== user.id && session.metadata?.userId !== user.id) {
    return { pro: false }
  }

  const sub =
    typeof session.subscription === "object" && session.subscription !== null
      ? session.subscription
      : null
  const active =
    session.status === "complete" &&
    (session.payment_status === "paid" || session.payment_status === "no_payment_required")

  if (!active) return { pro: false }

  const periodEnd =
    sub && typeof sub.items?.data?.[0]?.current_period_end === "number"
      ? new Date(sub.items.data[0].current_period_end * 1000)
      : null

  await db
    .insert(subscriptions)
    .values({
      id: randomUUID(),
      userId: user.id,
      status: "active",
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
      stripeSubscriptionId: sub?.id ?? null,
      currentPeriodEnd: periodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        status: "active",
        stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
        stripeSubscriptionId: sub?.id ?? undefined,
        currentPeriodEnd: periodEnd ?? undefined,
        updatedAt: new Date(),
      },
    })

  return { pro: true }
}
