import { redirect } from "next/navigation"
import Link from "next/link"
import { eq } from "drizzle-orm"
import { Crown, User } from "lucide-react"
import { getSessionUser } from "@/lib/access"
import { db } from "@/lib/db"
import { subscriptions } from "@/lib/db/schema"
import { buttonVariants } from "@/components/ui/button"
import { ManageBillingButton } from "@/components/account/manage-billing-button"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const PRO_STATES = new Set(["active", "trialing"])

function fmtDate(d: Date | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
}

/**
 * Account & Billing. Signed-in surface where a member sees their plan status
 * and self-serves via the Stripe Billing Portal (cancel, card, invoices).
 * Status is read from our local subscriptions row, which the Stripe webhook
 * keeps in sync — Stripe remains the source of truth.
 */
export default async function AccountPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/account")

  const row = (
    await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1)
  )[0]

  const isPro = !!row && PRO_STATES.has(row.status)
  const hasBilling = !!row?.stripeCustomerId
  const canceling = !!row?.cancelAtPeriodEnd && isPro

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
          <User className="size-5 text-foreground" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Account &amp; Billing</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {/* Plan status */}
      <section className="mt-8 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">
              Current plan
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-display text-xl font-bold text-foreground">
                {isPro ? "BSE Pro" : "Rookie (Free)"}
              </span>
              {isPro && <Crown className="size-5 text-primary" />}
            </div>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[0.625rem] uppercase tracking-widest",
              isPro ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground",
            )}
          >
            {row?.status ?? "inactive"}
          </span>
        </div>

        {isPro && (
          <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                Billing interval
              </dt>
              <dd className="mt-1 font-display text-sm font-semibold text-foreground">
                {row?.priceInterval ? `${row.priceInterval}ly` : "—"}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                {canceling ? "Access ends" : "Renews on"}
              </dt>
              <dd className="mt-1 font-display text-sm font-semibold text-foreground">
                {fmtDate(row?.currentPeriodEnd ?? null)}
              </dd>
            </div>
          </dl>
        )}

        {canceling && (
          <p className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed text-foreground/80">
            Your subscription is set to cancel at the end of the current period. You keep BSE Pro access until
            then. You can resume anytime from the billing portal.
          </p>
        )}
      </section>

      {/* Actions */}
      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-sm font-bold uppercase tracking-widest text-foreground">
          Manage billing
        </h2>
        {hasBilling ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Update your payment method, download invoices, or cancel your subscription in Stripe&apos;s secure
              billing portal.
            </p>
            <div className="mt-4">
              <ManageBillingButton />
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              You don&apos;t have a paid subscription yet. Go Pro to unlock every breakdown on the Board.
            </p>
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "default" }),
                "mt-4 h-11 font-display font-semibold uppercase tracking-wide",
              )}
            >
              <Crown className="size-4" /> View BSE Pro
            </Link>
          </>
        )}
      </section>
    </main>
  )
}
