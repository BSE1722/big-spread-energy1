import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAdmin } from "@/lib/admin-auth"
import { listCustomers, listPayments, getSummary } from "@/lib/admin-data"
import { AdminRefresh } from "@/components/admin/admin-refresh"
import { AdminDashboard } from "@/components/admin/admin-dashboard"
import { AdminPicks } from "@/components/admin/admin-picks"
import {
  listPredictions,
  listCorrections,
  listPublishableGames,
  listGradingRuns,
} from "@/lib/predictions/service"
import { toPredictionView } from "@/lib/predictions/view"

// Hidden route: not linked in nav and kept out of search indexes.
export const metadata: Metadata = {
  title: "Admin — Big Spread Energy",
  robots: { index: false, follow: false },
}

// Never cache an authorization-gated page.
export const dynamic = "force-dynamic"

export default async function AdminPage() {
  // SERVER-SIDE authorization. Knowing the URL is not enough — a valid admin
  // session is required. Non-admins get a 404 (we don't confirm the page even
  // exists to unauthorized visitors).
  const admin = await getAdmin()
  if (!admin.ok) notFound()

  const customers = await listCustomers()
  const [payments, summary] = await Promise.all([listPayments(100), getSummary(customers)])

  // Official BSE Picks data.
  const [publishable, predictionRows, runs] = await Promise.all([
    listPublishableGames(),
    listPredictions(),
    listGradingRuns(10),
  ])
  const corrections = await listCorrections(predictionRows.map((p) => p.id))
  const predictionViews = predictionRows.map((p) => toPredictionView(p, corrections))

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Admin · {admin.email}</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground">BSE Control Room</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Customers, subscriptions, and payment history. Odds refresh controls are at the bottom.
        </p>
      </header>

      <AdminDashboard customers={customers} payments={payments} summary={summary} />

      <section className="mt-12 border-t border-border pt-8">
        <h2 className="mb-2 font-display text-xl font-bold text-foreground">Official BSE Picks</h2>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Publish and lock official picks, grade finals on demand, and record append-only corrections.
          The public Track Record page reflects every action here.
        </p>
        <AdminPicks publishable={publishable} predictions={predictionViews} runs={runs} />
      </section>

      <section className="mt-12 border-t border-border pt-8">
        <h2 className="mb-2 font-display text-xl font-bold text-foreground">DraftKings Lines</h2>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Odds are frozen. The Board keeps showing the last saved snapshot until you run a manual refresh here.
        </p>
        <AdminRefresh />
      </section>

      <section className="mt-12 border-t border-border pt-8">
        <h2 className="mb-2 font-display text-xl font-bold text-foreground">Research</h2>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Shadow validation for the one frozen research candidate. These are logged, before-kickoff signals — not
          Official BSE Picks and not deployed.
        </p>
        <a
          href="/admin/shadow-validation"
          className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 font-mono text-sm text-foreground transition-colors hover:bg-muted"
        >
          Open Shadow Validation →
        </a>
      </section>
    </main>
  )
}
