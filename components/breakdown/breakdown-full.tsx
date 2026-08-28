import {
  Activity,
  CloudSun,
  FileText,
  Gauge,
  LineChart,
  Newspaper,
  ShieldAlert,
  Stethoscope,
  Target,
  TrendingUp,
} from "lucide-react"
import type { SignalDescription } from "@/lib/bse/model-signal"

const PLACEHOLDER = "—"

interface LineHistory {
  openingSpread: number | null
  previousSpread: number | null
  currentSpread: number | null
  spreadMovement: number | null
  openingTotal: number | null
  previousTotal: number | null
  currentTotal: number | null
  totalMovement: number | null
}

function fmt(n: number | null, signed = false): string {
  if (n == null) return PLACEHOLDER
  if (signed) return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1)
  return n.toFixed(1)
}

/** Format a home-relative spread as a team-anchored string, e.g. "Georgia -6.5". */
function spreadLabel(spreadHome: number | null, homeTeam: string, awayTeam: string): string {
  if (spreadHome == null) return PLACEHOLDER
  if (spreadHome === 0) return "Pick'em"
  // Negative home spread => home favored.
  return spreadHome < 0 ? `${homeTeam} ${spreadHome.toFixed(1)}` : `${awayTeam} ${(-spreadHome).toFixed(1)}`
}

/**
 * The full unlocked breakdown. Line movement + market data are REAL snapshot
 * data. The BSE spread read (fair spread, edge, lean, 0-100 rating) is the
 * FROZEN model's output and is always rendered under an in-validation banner so
 * it is never presented as proven performance. Fields the model does not
 * produce (totals, factors, weather, injuries, news, simulation, win prob)
 * keep honest empty states — nothing is fabricated.
 */
export function BreakdownFull({
  lineHistory,
  signal,
  marketSpreadHome,
  homeTeam,
  awayTeam,
}: {
  lineHistory: LineHistory | null
  signal: SignalDescription | null
  marketSpreadHome: number | null
  homeTeam: string
  awayTeam: string
}) {
  const hasMovement =
    lineHistory != null &&
    (lineHistory.openingSpread != null ||
      lineHistory.currentSpread != null ||
      lineHistory.openingTotal != null ||
      lineHistory.currentTotal != null)

  return (
    <div className="mt-6 space-y-4">
      {/* In-validation disclaimer — always present when a signal is shown. */}
      {signal ? (
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-foreground/80">
            <span className="font-semibold text-foreground">Shadow validation.</span> This is the frozen BSE
            model&apos;s read on the spread, under live 2026 tracking. It is a research signal for evaluation —{" "}
            <span className="font-semibold">not a performance guarantee and not a betting recommendation.</span>
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {/* BSE spread read — REAL frozen-model output (or honest pending state). */}
        <Panel icon={Target} title="BSE Fair Spread">
          {signal ? (
            <>
              <BigStat value={spreadLabel(signal.fairSpreadHome, homeTeam, awayTeam)} tone="foreground" />
              <Empty note={`Market: ${spreadLabel(marketSpreadHome, homeTeam, awayTeam)}. The model's spread estimate for this matchup.`} />
            </>
          ) : (
            <>
              <BigStat value={PLACEHOLDER} />
              <Empty note="Model signal publishes once this game is scored before kickoff." />
            </>
          )}
        </Panel>

        <Panel icon={Gauge} title="Model Edge vs. Market">
          {signal ? (
            <>
              <BigStat value={`${signal.edgePoints > 0 ? "+" : ""}${signal.edgePoints.toFixed(2)} pts`} tone="foreground" />
              <Empty
                note={
                  signal.qualifies
                    ? `At or beyond the ${signal.threshold.toFixed(1)}-pt tracking threshold.`
                    : `Below the ${signal.threshold.toFixed(1)}-pt tracking threshold — no lean asserted.`
                }
              />
            </>
          ) : (
            <>
              <BigStat value={PLACEHOLDER} />
              <Empty note="Edge vs. the market publishes with the signal." />
            </>
          )}
        </Panel>

        <Panel icon={TrendingUp} title="BSE Lean" span2>
          {signal && signal.lean !== "none" && signal.leanTeam ? (
            <>
              <BigStat value={signal.leanTeam} tone="primary" />
              <Empty note="Directional lean only. A qualifying signal, not a graded pick or a wager instruction." />
            </>
          ) : signal ? (
            <>
              <BigStat value="No lean" />
              <Empty note="The model does not clear the tracking threshold on this game." />
            </>
          ) : (
            <>
              <BigStat value={PLACEHOLDER} />
              <Empty note="The model's lean is released once it scores this game." />
            </>
          )}
        </Panel>

        {/* Signal strength — reuse the 0-100 rating. */}
        <Panel icon={Activity} title="Signal Strength" span2>
          {signal ? (
            <div className="flex items-end gap-4">
              <BigStat value={`${signal.rating}`} tone="foreground" />
              <span className="pb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                / 100 — scaled from edge size
              </span>
            </div>
          ) : (
            <>
              <BigStat value={PLACEHOLDER} />
              <Empty note="A 0–100 strength score derived from the model edge." />
            </>
          )}
        </Panel>

        {/* Line Movement — REAL data */}
        <Panel icon={LineChart} title="Line Movement" span2>
          {hasMovement && lineHistory ? (
            <div className="grid grid-cols-2 gap-4">
              <MovementColumn
                label="Spread (home)"
                opening={fmt(lineHistory.openingSpread, true)}
                current={fmt(lineHistory.currentSpread, true)}
                movement={fmt(lineHistory.spreadMovement, true)}
              />
              <MovementColumn
                label="Total"
                opening={fmt(lineHistory.openingTotal)}
                current={fmt(lineHistory.currentTotal)}
                movement={fmt(lineHistory.totalMovement, true)}
              />
            </div>
          ) : (
            <Empty note="No line movement recorded yet. Movement accrues across snapshot refreshes." />
          )}
        </Panel>

        {/* Fields the frozen model does NOT produce — honest, unfabricated. */}
        <Panel icon={CloudSun} title="Weather">
          <Empty note="Not modeled." />
        </Panel>

        <Panel icon={Stethoscope} title="Injuries / Personnel">
          <Empty note="Not modeled." />
        </Panel>

        <Panel icon={Newspaper} title="News / Context">
          <Empty note="Not modeled." />
        </Panel>

        <Panel icon={FileText} title="Totals & Win Probability">
          <Empty note="The frozen model produces a spread read only. Totals and win probability are not modeled." />
        </Panel>
      </div>
    </div>
  )
}

function Panel({
  icon: Icon,
  title,
  span2,
  children,
}: {
  icon: typeof LineChart
  title: string
  span2?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={span2 ? "md:col-span-2" : undefined}>
      <div className="h-full rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-primary" />
          <h3 className="font-display text-sm font-bold uppercase tracking-widest text-foreground">{title}</h3>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </section>
  )
}

function MovementColumn({
  label,
  opening,
  current,
  movement,
}: {
  label: string
  opening: string
  current: string
  movement: string
}) {
  return (
    <div className="rounded-lg bg-background p-4">
      <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">{label}</p>
      <dl className="mt-2 space-y-1.5 font-mono text-sm">
        <Row k="Open" v={opening} />
        <Row k="Now" v={current} highlight />
        <Row k="Move" v={movement} />
      </dl>
    </div>
  )
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={highlight ? "font-semibold text-foreground" : "text-foreground/80"}>{v}</dd>
    </div>
  )
}

function BigStat({ value, tone = "muted" }: { value: string; tone?: "muted" | "foreground" | "primary" }) {
  const cls =
    tone === "primary" ? "text-primary" : tone === "foreground" ? "text-foreground" : "text-muted-foreground"
  return <p className={`font-display text-3xl font-bold tabular-nums ${cls}`}>{value}</p>
}

function Empty({ note }: { note: string }) {
  return <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>
}
