/**
 * BSE Pro subscription — the single server-side source of truth for pricing.
 * The client may pick a billing interval but NEVER sends a price; the amount is
 * always read from here when creating the Stripe Checkout session.
 */
export type BillingInterval = "month" | "year"

export interface ProPlan {
  name: string
  /** Price in cents per interval. */
  monthlyCents: number
  yearlyCents: number
  currency: string
}

export const BSE_PRO: ProPlan = {
  name: "BSE Pro",
  monthlyCents: 2999, // $29.99 / mo
  yearlyCents: 28800, // $24 / mo billed yearly
  currency: "usd",
}

export function proPriceCents(interval: BillingInterval): number {
  return interval === "year" ? BSE_PRO.yearlyCents : BSE_PRO.monthlyCents
}
