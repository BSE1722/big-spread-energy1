import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { listPredictions, summarize, type PerformanceSummary } from "@/lib/predictions/service"
import { formatUnits } from "@/lib/predictions/view"

/**
 * THE RECEIPTS — the TRUST surface. Reads the SAME real track record that powers
 * /performance (summarize(listPredictions())). It never fabricates a win rate,
 * record, units, or ROI: until picks are graded it shows the honest tracking
 * state (0 graded, N pending) rather than an invented number. If the DB read
 * fails, it degrades to the honest "tracking" copy instead of erroring.
 */
export async function Receipts() {
  let summary: PerformanceSummary | null = null
  try {
    summary = summarize(await listPredictions())
  } catch (err) {
    console.error("[v0] receipts summary load failed; showing honest tracking state:", err)
  }

  const graded = summary?.totalGraded ?? 0
  const pending = summary?.pending ?? 0
  const hasGraded = graded > 0

  const record = summary
    ? `${summary.record.wins}-${summary.record.losses}-${summary.record.pushes}`
    : "0-0-0"

  const stats: { value: string; label: string }[] = hasGraded
    ? [
        { value: record, label: "Record (W-L-P)" },
        { value: summary?.winRatePct != null ? `${summary.winRatePct}%` : "—", label: "Win Rate (ATS)" },
        { value: formatUnits(summary?.unitsDelta ?? null), label: "Units" },
        { value: summary?.overallRoiPct != null ? `${summary.overallRoiPct}%` : "—", label: "ROI" },
      ]
    : [
        { value: record, label: "Graded Record" },
        { value: String(pending), label: "Picks Locked & Pending" },
        { value: "—", label: "Win Rate — after grading" },
        { value: "—", label: "Units — after grading" },
      ]

  return (
    <section className="border-b border-border/60 bg-background py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <span className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.18em] text-primary">
              Verified Track Record
            </span>
            <h2 className="mt-2 font-display text-5xl font-bold uppercase leading-[0.85] tracking-tight text-foreground sm:text-6xl">
              The <span className="text-primary text-glow">Receipts.</span>
            </h2>
            <ul className="mt-6 space-y-1.5 font-display text-lg font-bold uppercase tracking-tight text-foreground">
              <li>We post it.</li>
              <li>We timestamp it.</li>
              <li>We grade it.</li>
              <li className="text-primary">We don&apos;t delete the losers.</li>
            </ul>
            <Link
              href="/performance"
              className="mt-6 inline-flex min-h-11 items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-primary hover:text-primary/80"
            >
              See The Full Record <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                  <div className="font-display text-2xl font-bold tabular-nums text-primary sm:text-3xl">
                    {s.value}
                  </div>
                  <div className="mt-1 text-[0.6875rem] uppercase leading-tight tracking-wide text-muted-foreground">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-border bg-card p-5">
              <p className="text-pretty text-sm leading-relaxed text-foreground">
                {hasGraded
                  ? "Every BSE rating, edge, and official pick is frozen the moment it's published — before kickoff — then graded straight from final scores. Wins, losses, and pushes all stay up permanently."
                  : "Model tracking begins with the first graded slate. Every official pick is frozen and timestamped when published, so results are graded against the number we actually posted — never revised after the outcome."}
              </p>
              <p className="mt-3 font-mono text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                No fabricated records. No cherry-picked wins.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
