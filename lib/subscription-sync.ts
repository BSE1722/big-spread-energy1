import "server-only"

import type Stripe from "stripe"
import { randomUUID } from "crypto"
import { db } from "@/lib/db"
import { subscriptions, paymentHistory } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

/**
 * Maps a Stripe Subscription to our local row. This is the ONE place that
 * decides local subscription state, so the webhook and the checkout-return
 * reconciliation can never disagree. Idempotent: writing the same Stripe state
 * twice produces the same row.
 *
 * The Stripe subscription is always the source of truth — we mirror its status,
 * period end, and cancel flag rather than inferring them locally.
 */

function toDate(secs: number | null | undefined): Date | null {
  return typeof secs === "number" ? new Date(secs * 1000) : null
}

/**
 * Resolve which local user a Stripe subscription belongs to. We store userId in
 * subscription metadata at checkout; fall back to matching an existing row by
 * customer id.
 */
async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const metaUserId = (sub.metadata?.userId ?? "").trim()
  if (metaUserId) return metaUserId

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id
  if (!customerId) return null

  const existing = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1)

  return existing[0]?.userId ?? null
}

export async function syncSubscriptionFromStripe(sub: Stripe.Subscription): Promise<{ userId: string | null }> {
  const userId = await resolveUserId(sub)
  if (!userId) {
    console.log(`[v0] syncSubscription: could not resolve userId for sub ${sub.id}`)
    return { userId: null }
  }

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id
  const item = sub.items?.data?.[0]
  const priceId = item?.price?.id ?? null
  const priceInterval = item?.price?.recurring?.interval ?? null

  // On the installed Stripe API version, current_period_* live on the
  // subscription ITEM, not the subscription object. Read from the item.
  const now = new Date()
  const values = {
    status: sub.status, // active | trialing | past_due | canceled | unpaid | incomplete...
    stripeCustomerId: customerId ?? null,
    stripeSubscriptionId: sub.id,
    priceId,
    priceInterval,
    currentPeriodStart: toDate(item?.current_period_start),
    currentPeriodEnd: toDate(item?.current_period_end),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    canceledAt: toDate(sub.canceled_at),
    updatedAt: now,
  }

  const existing = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1)

  if (existing[0]) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.userId, userId))
  } else {
    await db.insert(subscriptions).values({ id: randomUUID(), userId, createdAt: now, ...values })
  }

  return { userId }
}

/** Marks a subscription canceled/inactive when Stripe deletes it. */
export async function markSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const userId = await resolveUserId(sub)
  if (!userId) return
  await db
    .update(subscriptions)
    .set({
      status: "canceled",
      cancelAtPeriodEnd: false,
      canceledAt: toDate(sub.canceled_at) ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, userId))
}

/**
 * Records a payment-history row idempotently. Keyed on (stripeEventId, type) so
 * a redelivered webhook does not create duplicate audit rows.
 */
export async function recordPaymentHistory(entry: {
  userId: string | null
  stripeCustomerId: string | null
  stripeInvoiceId?: string | null
  stripeEventId: string
  type: string
  status?: string | null
  amount?: number | null
  currency?: string | null
  description?: string | null
  periodStart?: Date | null
  periodEnd?: Date | null
  occurredAt?: Date | null
}): Promise<void> {
  const dupe = await db
    .select({ id: paymentHistory.id })
    .from(paymentHistory)
    .where(and(eq(paymentHistory.stripeEventId, entry.stripeEventId), eq(paymentHistory.type, entry.type)))
    .limit(1)
  if (dupe[0]) return

  await db.insert(paymentHistory).values({
    id: randomUUID(),
    userId: entry.userId ?? null,
    stripeCustomerId: entry.stripeCustomerId ?? null,
    stripeInvoiceId: entry.stripeInvoiceId ?? null,
    stripeEventId: entry.stripeEventId,
    type: entry.type,
    status: entry.status ?? null,
    amount: entry.amount ?? null,
    currency: entry.currency ?? null,
    description: entry.description ?? null,
    periodStart: entry.periodStart ?? null,
    periodEnd: entry.periodEnd ?? null,
    occurredAt: entry.occurredAt ?? new Date(),
  })
}
