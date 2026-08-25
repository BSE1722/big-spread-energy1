import "server-only"

import { db } from "@/lib/db"
import { user as userTable, subscriptions, paymentHistory } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"

/**
 * Read models for the admin dashboard. These are only ever called AFTER
 * getAdmin() has authorized the request (page + API both gate first). No secret
 * data (password hashes, tokens) is ever selected here.
 */

export interface AdminCustomerRow {
  userId: string
  name: string
  email: string
  emailVerified: boolean
  role: string
  signupDate: string
  tier: "pro" | "rookie" | "guest-inactive"
  subscriptionStatus: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  priceInterval: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
}

function deriveTier(status: string | null, currentPeriodEnd: Date | null): AdminCustomerRow["tier"] {
  if ((status === "active" || status === "trialing") && (!currentPeriodEnd || currentPeriodEnd.getTime() > Date.now())) {
    return "pro"
  }
  return "guest-inactive"
}

export async function listCustomers(): Promise<AdminCustomerRow[]> {
  // Left join users → subscriptions so users with no subscription still appear.
  const rows = await db
    .select({
      userId: userTable.id,
      name: userTable.name,
      email: userTable.email,
      emailVerified: userTable.emailVerified,
      role: userTable.role,
      signupDate: userTable.createdAt,
      status: subscriptions.status,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      priceInterval: subscriptions.priceInterval,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      canceledAt: subscriptions.canceledAt,
    })
    .from(userTable)
    .leftJoin(subscriptions, eq(subscriptions.userId, userTable.id))
    .orderBy(desc(userTable.createdAt))

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    emailVerified: r.emailVerified,
    role: r.role,
    signupDate: r.signupDate.toISOString(),
    tier: deriveTier(r.status, r.currentPeriodEnd),
    subscriptionStatus: r.status ?? "none",
    stripeCustomerId: r.stripeCustomerId,
    stripeSubscriptionId: r.stripeSubscriptionId,
    priceInterval: r.priceInterval,
    currentPeriodEnd: r.currentPeriodEnd ? r.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: r.cancelAtPeriodEnd ?? false,
    canceledAt: r.canceledAt ? r.canceledAt.toISOString() : null,
  }))
}

export interface AdminPaymentRow {
  id: string
  userId: string | null
  type: string
  status: string | null
  amount: number | null
  currency: string | null
  description: string | null
  occurredAt: string
  periodEnd: string | null
}

export async function listPayments(limit = 100): Promise<AdminPaymentRow[]> {
  const rows = await db
    .select()
    .from(paymentHistory)
    .orderBy(desc(paymentHistory.occurredAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    type: r.type,
    status: r.status,
    amount: r.amount,
    currency: r.currency,
    description: r.description,
    occurredAt: r.occurredAt.toISOString(),
    periodEnd: r.periodEnd ? r.periodEnd.toISOString() : null,
  }))
}

export interface AdminSummary {
  totalUsers: number
  proUsers: number
  canceling: number
  pastDue: number
}

export async function getSummary(customers: AdminCustomerRow[]): Promise<AdminSummary> {
  return {
    totalUsers: customers.length,
    proUsers: customers.filter((c) => c.tier === "pro").length,
    canceling: customers.filter((c) => c.cancelAtPeriodEnd).length,
    pastDue: customers.filter((c) => c.subscriptionStatus === "past_due" || c.subscriptionStatus === "unpaid").length,
  }
}
