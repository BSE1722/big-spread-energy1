"use client"

import { useState } from "react"
import type { AdminCustomerRow, AdminPaymentRow, AdminSummary } from "@/lib/admin-data"

/**
 * Presentational admin dashboard. All data is fetched + authorized server-side
 * in app/admin/page.tsx and passed in as props; this component renders it.
 */
export function AdminDashboard({
  customers,
  payments,
  summary,
}: {
  customers: AdminCustomerRow[]
  payments: AdminPaymentRow[]
  summary: AdminSummary
}) {
  const [tab, setTab] = useState<"customers" | "payments">("customers")

  return (
    <div>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total users" value={summary.totalUsers} />
        <Stat label="Pro users" value={summary.proUsers} accent />
        <Stat label="Canceling" value={summary.canceling} />
        <Stat label="Past due" value={summary.pastDue} />
      </div>

      <div className="mb-4 flex gap-2">
        <TabButton active={tab === "customers"} onClick={() => setTab("customers")}>
          Customers ({customers.length})
        </TabButton>
        <TabButton active={tab === "payments"} onClick={() => setTab("payments")}>
          Payment history ({payments.length})
        </TabButton>
      </div>

      {tab === "customers" ? <CustomersTable rows={customers} /> : <PaymentsTable rows={payments} />}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function TierBadge({ tier }: { tier: AdminCustomerRow["tier"] }) {
  const map: Record<AdminCustomerRow["tier"], string> = {
    pro: "bg-primary/15 text-primary",
    rookie: "bg-secondary text-foreground",
    "guest-inactive": "bg-muted text-muted-foreground",
  }
  const label = tier === "guest-inactive" ? "Free/Inactive" : tier === "pro" ? "Pro" : "Rookie"
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${map[tier]}`}>{label}</span>
}

function CustomersTable({ rows }: { rows: AdminCustomerRow[] }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">No users yet.</p>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-secondary/50 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>User</Th>
            <Th>Signup</Th>
            <Th>Tier</Th>
            <Th>Status</Th>
            <Th>Interval</Th>
            <Th>Renews / Ends</Th>
            <Th>Cancel state</Th>
            <Th>Stripe IDs</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.userId} className="align-top">
              <Td>
                <div className="font-medium text-foreground">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.email}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {r.emailVerified ? "email verified" : "email unverified"}
                  {r.role === "admin" ? " · admin" : ""}
                </div>
              </Td>
              <Td>{fmtDate(r.signupDate)}</Td>
              <Td>
                <TierBadge tier={r.tier} />
              </Td>
              <Td>{r.subscriptionStatus}</Td>
              <Td>{r.priceInterval ?? "—"}</Td>
              <Td>{fmtDate(r.currentPeriodEnd)}</Td>
              <Td>
                {r.cancelAtPeriodEnd ? (
                  <span className="text-amber-500">Cancels at period end</span>
                ) : r.canceledAt ? (
                  <span className="text-destructive">Canceled {fmtDate(r.canceledAt)}</span>
                ) : (
                  "—"
                )}
              </Td>
              <Td>
                <div className="max-w-[200px] truncate font-mono text-[11px] text-muted-foreground">
                  {r.stripeCustomerId ?? "—"}
                </div>
                <div className="max-w-[200px] truncate font-mono text-[11px] text-muted-foreground">
                  {r.stripeSubscriptionId ?? "—"}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PaymentsTable({ rows }: { rows: AdminPaymentRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        No payment history yet. Rows appear here as Stripe webhook events (invoice.paid, payment_failed,
        cancellations) are received.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-secondary/50 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <Th>When</Th>
            <Th>Type</Th>
            <Th>Status</Th>
            <Th>Amount</Th>
            <Th>Description</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>{fmtDate(r.occurredAt)}</Td>
              <Td className="font-mono text-xs">{r.type}</Td>
              <Td>{r.status ?? "—"}</Td>
              <Td>
                {r.amount != null
                  ? `${(r.amount / 100).toLocaleString(undefined, { style: "currency", currency: (r.currency ?? "usd").toUpperCase() })}`
                  : "—"}
              </Td>
              <Td>{r.description ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2.5 font-normal">{children}</th>
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 text-foreground ${className}`}>{children}</td>
}
