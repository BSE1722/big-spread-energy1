import {
  Activity,
  CloudSun,
  FileText,
  Gauge,
  LineChart,
  Newspaper,
  Stethoscope,
  Target,
  TrendingUp,
} from "lucide-react"

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

/**
 * The full unlocked breakdown. Line movement is REAL data from the frozen
 * snapshot. The BSE model sections render honest "not yet available" states
 * because the model output is null until the engine is wired — we never
 * fabricate a fair line, edge, pick, or factor.
 */
export function BreakdownFull({ lineHistory }: { lineHistory: LineHistory | null }) {
  const hasMovement =
    lineHistory != null &&
    (lineHistory.openingSpread != null ||
      lineHistory.currentSpread != null ||
      lineHistory.openingTotal != null ||
      lineHistory.currentTotal != null)

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
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

      {/* Model-derived sections — honest empty states until the engine is wired */}
      <Panel icon={Target} title="BSE Fair Spread">
        <BigStat value={PLACEHOLDER} />
        <Empty note="BSE model projection publishes before kickoff." />
      </Panel>

      <Panel icon={Gauge} title="Model Edge">
        <BigStat value={PLACEHOLDER} />
        <Empty note="Exact edge vs. the market publishes with the projection." />
      </Panel>

      <Panel icon={TrendingUp} title="BSE Pick" span2>
        <BigStat value={PLACEHOLDER} />
        <Empty note="BSE's recommended side is released once the model runs for this game." />
      </Panel>

      <Panel icon={Activity} title="Factor Breakdown" span2>
        <Empty note="The individual model factors will appear here once BSE runs this matchup." />
      </Panel>

      <Panel icon={CloudSun} title="Weather">
        <Empty note="Unavailable" />
      </Panel>

      <Panel icon={Stethoscope} title="Injuries / Personnel">
        <Empty note="Unavailable" />
      </Panel>

      <Panel icon={Newspaper} title="News / Context">
        <Empty note="Unavailable" />
      </Panel>

      <Panel icon={Gauge} title="Simulation">
        <Empty note="Simulation output publishes with the projection." />
      </Panel>

      <Panel icon={FileText} title="BSE Explanation" span2>
        <Empty note="The full BSE write-up for this game will appear here once the model has run." />
      </Panel>
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
          <h3 className="font-display text-sm font-bold uppercase tracking-widest text-foreground">
            {title}
          </h3>
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

function BigStat({ value }: { value: string }) {
  return <p className="font-display text-3xl font-bold tabular-nums text-muted-foreground">{value}</p>
}

function Empty({ note }: { note: string }) {
  return <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>
}
