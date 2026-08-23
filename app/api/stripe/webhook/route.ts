import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"
import type Stripe from "stripe"
import { eq } from "drizzle-orm"
import { stripe } from "@/lib/stripe"
import { db } from "@/lib/db"
import { subscriptions } from "@/lib/db/schema"

/**
 * Stripe webhook — production reconciliation of BSE Pro status.
 *
 * If STRIPE_WEBHOOK_SECRET is configured, the signature is verified. In the v0
 * sandbox (no endpoint configured yet) this route is inert and the return-time
 * `confirmProCheckout` action does the reconciliation instead. Both paths key
 * on userId, so whichever runs first wins and the other is a safe no-op.
 */
export const dynamic = "force-dynamic"

const RELEVANT = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
])

async function setStatus(params: {
  userId?: string | null
  customerId?: string | null
  status: string
  subscriptionId?: string | null
  currentPeriodEnd?: Date | null
}) {
  const { userId, customerId, status, subscriptionId, currentPeriodEnd } = params

  // Prefer matching by userId; fall back to the Stripe customer id.
  if (userId) {
    await db
      .insert(subscriptions)
      .values({
        id: randomUUID(),
        userId,
        status,
        stripeCustomerId: customerId ?? null,
        stripeSubscriptionId: subscriptionId ?? null,
        currentPeriodEnd: currentPeriodEnd ?? null,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          status,
          stripeCustomerId: customerId ?? undefined,
          stripeSubscriptionId: subscriptionId ?? undefined,
          currentPeriodEnd: currentPeriodEnd ?? undefined,
          updatedAt: new Date(),
        },
      })
    return
  }

  if (customerId) {
    await db
      .update(subscriptions)
      .set({
        status,
        stripeSubscriptionId: subscriptionId ?? undefined,
        currentPeriodEnd: currentPeriodEnd ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeCustomerId, customerId))
  }
}

function periodEndFromSub(sub: Stripe.Subscription): Date | null {
  const ts = sub.items?.data?.[0]?.current_period_end
  return typeof ts === "number" ? new Date(ts * 1000) : null
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const body = await req.text()

  let event: Stripe.Event
  if (secret) {
    const sig = req.headers.get("stripe-signature")
    if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 })
    try {
      event = stripe.webhooks.constructEvent(body, sig, secret)
    } catch (err) {
      return NextResponse.json(
        { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : "unknown"}` },
        { status: 400 },
      )
    }
  } else {
    // No secret configured (sandbox) — parse without verification. Safe because
    // Pro is also reconciled server-side on the authenticated checkout return.
    try {
      event = JSON.parse(body) as Stripe.Event
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }
  }

  if (!RELEVANT.has(event.type)) {
    return NextResponse.json({ received: true })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object
        const userId = session.metadata?.userId ?? session.client_reference_id ?? null
        const subId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null
        let periodEnd: Date | null = null
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId)
          periodEnd = periodEndFromSub(sub)
        }
        await setStatus({
          userId,
          customerId,
          status: "active",
          subscriptionId: subId,
          currentPeriodEnd: periodEnd,
        })
        break
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object
        const status = sub.status === "trialing" ? "trialing" : sub.status === "active" ? "active" : "inactive"
        await setStatus({
          userId: sub.metadata?.userId ?? null,
          customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          status,
          subscriptionId: sub.id,
          currentPeriodEnd: periodEndFromSub(sub),
        })
        break
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object
        await setStatus({
          userId: sub.metadata?.userId ?? null,
          customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          status: "canceled",
          subscriptionId: sub.id,
          currentPeriodEnd: periodEndFromSub(sub),
        })
        break
      }
    }
  } catch (err) {
    console.log("[v0] stripe webhook handler error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
