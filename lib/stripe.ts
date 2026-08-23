import "server-only"

import Stripe from "stripe"

/**
 * Server-only Stripe client. The installed `stripe` package (v22) pins its own
 * API version, so we don't override it here.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)
