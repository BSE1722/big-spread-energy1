import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAdmin } from "@/lib/admin-auth"
import { listCustomers, listPayments, getSummary } from "@/lib/admin-data"
import { AdminRefresh } from "@/components/admin/admin-refresh"
import { AdminDashboard } from "@/components/admin/admin-dashboard"
import { AdminPicks } from "@/components/admin/admin-picks"
import { WeeklyOps } from "@/components/admin/weekly-ops"
import { ToolConfig } from "@/components/admin/tool-config"
import { getWeeklyOpsSnapshot } from "@/lib/weekly-ops/service"
import { getToolLimits } from "@/lib/config/service"
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

  // Weekly Operations status is computed read-only from real data. If the
  // aggregator throws (e.g. a data source is briefly unavailable) we degrade
  // gracefully rather than break the whole control room.
  const weeklyOps = await getWeeklyOpsSnapshot().catch(() => null)

  // Editable free-tier tool limits (falls back to defaults if unset).
  const toolLimits = await getToolLimits()

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Admin · {admin.email}</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground">BSE Control Room</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Customers, subscriptions, and payment history. Odds refresh controls are at the bottom.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="mb-2 font-display text-xl font-bold text-foreground">Weekly Operations</h2>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          The full weekly workflow in one place. Each stage shows its live status from real data; generate this
          week&apos;s BSE ratings without leaving the dashboard. Nothing here retrains the frozen model or fabricates
          data.
        </p>
        {weeklyOps ? (
          <WeeklyOps snap={weeklyOps} />
        ) : (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            Weekly Operations status is temporarily unavailable (a data source did not respond). Refresh the page to
            try again — no data was changed.
          </p>
        )}
      </section>

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
        <h2 className="mb-2 font-display text-xl font-bold text-foreground">Postgame Review</h2>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          The honest validation dataset. Record analyzed tickets (frozen at analysis time), grade them from
          official CFBD finals, and read a deterministic postmortem — right/wrong calls, warning signs,
          alt-line protection, confidence calibration, and ticket fragility.
        </p>
        <a
          href="/admin/review"
          className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 font-mono text-sm text-foreground transition-colors hover:bg-muted"
        >
          Open Postgame Review →
        </a>
      </section>

      <section className="mt-12 border-t border-border pt-8">
        <h2 className="mb-2 font-display text-xl font-bold text-foreground">Rating Calibration</h2>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          How the frozen pregame BSE Rating has actually performed. Built only from graded legs whose rating was
          captured before kickoff — never recalculated, never fabricated. Buckets appear only once they have real
          observations.
        </p>
        <a
          href="/admin/calibration"
          className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 font-mono text-sm text-foreground transition-colors hover:bg-muted"
        >
          Open Rating Calibration →
        </a>
      </section>

      <section className="mt-12 border-t border-border pt-8">
        <h2 className="mb-2 font-display text-xl font-bold text-foreground">Tool Access Limits</h2>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          Free-tier weekly allowances for the tools. Changes take effect immediately — no redeploy. Pro members are
          always unlimited.
        </p>
        <ToolConfig initial={toolLimits} />
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
