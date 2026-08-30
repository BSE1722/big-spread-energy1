import type { FrozenCandidate, ShadowStats, WeekRow, SignalRow } from "@/lib/shadow/service"

function pct(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`
}
function num(n: number | null, digits = 2): string {
  return n == null ? "—" : n.toFixed(digits)
}
function signed(n: number | null, digits = 1): string {
  if (n == null) return "—"
  const s = n.toFixed(digits)
  return n > 0 ? `+${s}` : s
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function ShadowValidation({
  candidate,
  overall,
  weekly,
  signals,
}: {
  candidate: FrozenCandidate | null
  overall: ShadowStats | null
  weekly: WeekRow[]
  signals: SignalRow[]
}) {
  return (
    <div>
      {/* NOT-DEPLOYED banner — unmissable, top of page */}
      <div
        role="status"
        className="mb-8 rounded-lg border-2 border-dashed border-destructive/60 bg-destructive/10 px-4 py-3"
      >
        <p className="font-mono text-sm font-bold uppercase tracking-widest text-destructive">
          Shadow Validation — Not Deployed
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          These are logged, before-kickoff SHADOW SIGNALS for one frozen, unproven candidate. They are{" "}
          <span className="font-semibold text-foreground">not Official BSE Picks</span> and must not be bet. Purpose:
          collect prospective evidence to decide whether the edge is real.
        </p>
      </div>

      {/* Frozen candidate identity */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-lg font-bold text-foreground">Frozen Candidate</h2>
        {candidate ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-base font-bold text-foreground">
                {candidate.family}::{candidate.model}
              </span>
              <span className="font-mono text-sm text-muted-foreground">|</span>
              <span className="font-mono text-base font-bold text-foreground">edge &gt;= {candidate.threshold}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Model hash</dt>
                <dd className="font-mono text-foreground">{candidate.modelHash.slice(0, 16)}…</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Feature version</dt>
                <dd className="font-mono text-foreground">{candidate.featureVersion}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Frozen at</dt>
                <dd className="font-mono text-foreground">{new Date(candidate.frozenAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Train seasons</dt>
                <dd className="font-mono text-foreground">
                  {candidate.trainSeasons[0]}–{candidate.trainSeasons[candidate.trainSeasons.length - 1]} (excl 2020)
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Training rows</dt>
                <dd className="font-mono text-foreground">{candidate.trainingRowCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Hyperparams</dt>
                <dd className="font-mono text-foreground">{JSON.stringify(candidate.hyperparams)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No frozen candidate found. Run the freeze job.</p>
        )}
      </section>

      {/* Overall prospective results */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-lg font-bold text-foreground">2026 Prospective Results</h2>
        {overall && overall.signals > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Signals" value={String(overall.signals)} hint={`${overall.graded} graded`} />
            <StatCard label="ATS W-L-P" value={`${overall.wins}-${overall.losses}-${overall.pushes}`} />
            <StatCard label="ATS %" value={pct(overall.atsPct)} hint="of decided bets" />
            <StatCard label="ROI" value={pct(overall.roi)} hint="flat -110 units" />
            <StatCard label="Avg CLV" value={signed(overall.avgClv)} hint="points vs close" />
            <StatCard label="Median CLV" value={signed(overall.medianClv)} hint="points vs close" />
            <StatCard label="% Positive CLV" value={pct(overall.pctPositiveClv)} />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No shadow signals captured yet. During the 2026 season, run the weekly capture job before kickoff and the
            grader after finals; results will populate here.
          </p>
        )}
      </section>

      {/* Weekly breakdown */}
      {weekly.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-lg font-bold text-foreground">Results by Week</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Season</th>
                  <th className="px-3 py-2">Week</th>
                  <th className="px-3 py-2">Signals</th>
                  <th className="px-3 py-2">W-L-P</th>
                  <th className="px-3 py-2">ATS %</th>
                  <th className="px-3 py-2">ROI</th>
                  <th className="px-3 py-2">Avg CLV</th>
                  <th className="px-3 py-2">% +CLV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {weekly.map((w) => (
                  <tr key={`${w.season}-${w.week}`}>
                    <td className="px-3 py-2 font-mono text-foreground">{w.season}</td>
                    <td className="px-3 py-2 font-mono text-foreground">{w.week}</td>
                    <td className="px-3 py-2 font-mono text-foreground">{w.signals}</td>
                    <td className="px-3 py-2 font-mono text-foreground">
                      {w.wins}-{w.losses}-{w.pushes}
                    </td>
                    <td className="px-3 py-2 font-mono text-foreground">{pct(w.atsPct)}</td>
                    <td className="px-3 py-2 font-mono text-foreground">{pct(w.roi)}</td>
                    <td className="px-3 py-2 font-mono text-foreground">{signed(w.avgClv)}</td>
                    <td className="px-3 py-2 font-mono text-foreground">{pct(w.pctPositiveClv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Individual signals */}
      {signals.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-foreground">Signal Log</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Wk</th>
                  <th className="px-3 py-2">Matchup</th>
                  <th className="px-3 py-2">Side</th>
                  <th className="px-3 py-2">Edge</th>
                  <th className="px-3 py-2">Signal line</th>
                  <th className="px-3 py-2">ATS</th>
                  <th className="px-3 py-2">CLV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {signals.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{s.week}</td>
                    <td className="px-3 py-2 text-foreground">
                      {s.awayTeam} @ {s.homeTeam}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-foreground">{s.side.toUpperCase()}</td>
                    <td className="px-3 py-2 font-mono text-foreground">{signed(s.predictedEdge, 2)}</td>
                    <td className="px-3 py-2 font-mono text-foreground">
                      {s.side === "home" ? signed(s.signalSpreadHome) : signed(-s.signalSpreadHome)}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {s.atsResult ? (
                        <span
                          className={
                            s.atsResult === "WIN"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : s.atsResult === "LOSS"
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }
                        >
                          {s.atsResult}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">pending</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-foreground">{signed(s.clvPoints)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
