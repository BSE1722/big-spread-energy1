import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAdmin } from "@/lib/admin-auth"
import { getCalibrationReport } from "@/lib/calibration/service"

export const metadata: Metadata = {
  title: "Calibration — Big Spread Energy",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

function pct(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`
}
function num(n: number | null): string {
  return n == null ? "—" : Math.round(n * 10) / 10 + ""
}

export default async function CalibrationPage() {
  const admin = await getAdmin()
  if (!admin.ok) notFound()

  const report = await getCalibrationReport()
  const maxBin = Math.max(1, ...report.distribution.map((b) => b.count))

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Admin · Calibration</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground">BSE Rating Calibration</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Observed distribution of the real, pregame-captured BSE Ratings on saved analyses, and — once enough graded
          finals accumulate — how outcomes track with rating. This reads only frozen{" "}
          <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">reviewLegs.bseRating</code> values. It
          never recalculates, normalizes, or invents a rating or a bucket.
        </p>
      </header>

      {/* Observation counts */}
      <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total legs" value={String(report.totalLegs)} />
        <Stat label="Rated legs" value={String(report.ratedLegs)} />
        <Stat label="Unrated legs" value={String(report.unratedLegs)} />
        <Stat label="Graded + rated" value={String(report.gradedRatedLegs)} />
      </section>

      {/* Rating summary */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-lg font-bold text-foreground">Rating summary (rated legs)</h2>
        {report.ratedLegs === 0 ? (
          <EmptyPanel>
            No rated legs captured yet. As analyses are saved on games that have a frozen BSE signal, their real ratings
            appear here.
          </EmptyPanel>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Average" value={num(report.summary.avg)} />
            <Stat label="Median" value={num(report.summary.median)} />
            <Stat label="Min" value={num(report.summary.min)} />
            <Stat label="Max" value={num(report.summary.max)} />
          </div>
        )}
      </section>

      {/* Distribution histogram */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-lg font-bold text-foreground">Observed rating distribution</h2>
        {report.ratedLegs === 0 ? (
          <EmptyPanel>Nothing to plot yet — this is a display grouping of observed ratings, not a forecast.</EmptyPanel>
        ) : (
          <div className="space-y-1.5">
            {report.distribution.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{b.label}</span>
                <div className="h-6 flex-1 overflow-hidden rounded bg-secondary/40">
                  <div
                    className="h-full rounded bg-primary/70"
                    style={{ width: `${(b.count / maxBin) * 100}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-foreground">{b.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Win rate by rating (only when enough decisive graded legs exist) */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-foreground">Outcome vs rating</h2>
        {!report.sufficient || !report.winRateByRating ? (
          <EmptyPanel>
            Collecting observations. Win rate by rating and correlation are withheld until at least{" "}
            <strong className="text-foreground">{report.minObservations}</strong> decisive (win/loss) graded legs with a
            real rating exist — currently{" "}
            <strong className="text-foreground">{report.decisiveGradedRatedLegs}</strong>. BSE reports nothing it cannot
            yet support.
          </EmptyPanel>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Cover rate = wins / (wins + losses), pushes excluded. Rating ↔ win correlation:{" "}
              <strong className="text-foreground">{num(report.correlation)}</strong> over{" "}
              {report.decisiveGradedRatedLegs} decisive graded legs.
            </p>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left">Rating</th>
                    <th className="px-3 py-2 text-right">Graded</th>
                    <th className="px-3 py-2 text-right">W</th>
                    <th className="px-3 py-2 text-right">L</th>
                    <th className="px-3 py-2 text-right">P</th>
                    <th className="px-3 py-2 text-right">Cover</th>
                  </tr>
                </thead>
                <tbody>
                  {report.winRateByRating.map((b) => (
                    <tr key={b.label} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{b.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.graded}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.wins}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.losses}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.pushes}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{pct(b.winRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <p className="mt-10 font-mono text-[10px] leading-relaxed text-muted-foreground">
        Generated {new Date(report.generatedAt).toISOString().slice(0, 16).replace("T", " ")}Z. Read-only over the
        Postgame Review dataset.
      </p>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-5 text-sm leading-relaxed text-muted-foreground">
      {children}
    </div>
  )
}
