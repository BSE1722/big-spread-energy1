import {
  Activity,
  CloudSun,
  Gauge,
  LineChart,
  Newspaper,
  ShieldAlert,
  Stethoscope,
  Target,
  TrendingUp,
  Layers,
  Clock,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  XCircle,
} from "lucide-react"
import { formatSpreadTeam } from "@/lib/bse/context-engine"
import { WEATHER_IMPACT_LABEL } from "@/lib/bse/weather-impact"
import type { BreakdownAnalysis } from "@/lib/breakdown/assemble"
import { AltSpreadLab } from "@/components/breakdown/alt-spread-lab"

const DASH = "—"

function fmt(n: number | null, signed = false, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return DASH
  const v = n.toFixed(digits)
  return signed && n > 0 ? `+${v}` : v
}

function timeAgo(iso: string | null): string {
  if (!iso) return "not yet"
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return "unknown"
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

const VERDICT_TONE: Record<string, string> = {
  pass: "border-border bg-card text-foreground",
  lean: "border-primary/40 bg-primary/10 text-foreground",
  strong: "border-primary bg-primary/15 text-foreground",
  neutral: "border-border bg-card text-muted-foreground",
}

/**
 * The full unlocked Pro breakdown — an analytics terminal, not a grid of empty
 * cards. Everything is assembled server-side in lib/breakdown/assemble.ts:
 *   - BSE Verdict + plain-English why
 *   - Final BSE fair spread vs market (with the Base → Final ledger)
 *   - Why BSE sees it (factor map / double-count guard)
 *   - Market intelligence (open/current/base/final + edge-at-open vs edge-now)
 *   - Weather (real impact calc), Injuries & News (honest DATA UNAVAILABLE)
 *   - Alternate Spread Lab (value thresholds + interactive check)
 *   - What could change the read, and data freshness / provenance
 *
 * Nothing here is fabricated. Where a provider is missing, the section says so.
 */
export function BreakdownFull({
  gameId,
  analysis,
  snapshotAt,
}: {
  gameId: string
  analysis: BreakdownAnalysis
  snapshotAt: string | null
}) {
  const {
    homeTeam,
    awayTeam,
    marketSpreadHome,
    base,
    context,
    verdict,
    readStrength,
    factors,
    marketIntel,
    weather,
    weatherDetail,
    altLab,
    whatCouldChange,
    freshness,
    modelAvailable,
    inValidationNote,
  } = analysis

  const homeAbbr = homeTeam.length > 4 ? homeTeam.slice(0, 4).toUpperCase() : homeTeam.toUpperCase()
  const awayAbbr = awayTeam.length > 4 ? awayTeam.slice(0, 4).toUpperCase() : awayTeam.toUpperCase()

  if (!modelAvailable) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <h3 className="font-display text-sm font-bold uppercase tracking-widest text-foreground">Signal Pending</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The frozen BSE model has not scored this game yet. The full breakdown — verdict, fair spread, market
          intelligence and the alternate lab — publishes automatically once the model runs before kickoff. No values
          are shown until then; nothing here is estimated.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-4">
      {/* In-validation banner */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-foreground/80">{inValidationNote}</p>
      </div>

      {/* 1. VERDICT */}
      <section className={`rounded-xl border p-5 ${VERDICT_TONE[verdict.tone] ?? VERDICT_TONE.neutral}`}>
        <div className="flex items-center gap-2">
          <Target className="size-4 text-primary" />
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">BSE Verdict</h2>
        </div>
        <p className="mt-2 font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">{verdict.headline}</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{verdict.explanation}</p>
      </section>

      {/* 2. FINAL FAIR vs MARKET + strength */}
      <div className="grid gap-4 md:grid-cols-3">
        <Panel icon={Target} title="Final BSE Fair">
          <BigStat value={formatSpreadTeam(context.finalFairHomeSpread, homeTeam, awayTeam)} tone="primary" />
          <Sub note={`Market: ${formatSpreadTeam(marketSpreadHome, homeTeam, awayTeam)}`} />
        </Panel>
        <Panel icon={Gauge} title="Edge Now">
          <BigStat
            value={verdict.edgePoints != null ? `${fmt(verdict.edgePoints, true)} pt` : DASH}
            tone={readStrength.band === "pass" ? "foreground" : "primary"}
          />
          <Sub note={verdict.valueTeam ? `on ${verdict.valueTeam}` : "inside the agreement zone"} />
        </Panel>
        <Panel icon={Activity} title="Read Strength">
          <div className="flex items-end gap-2">
            <BigStat value={readStrength.rawScore != null ? String(readStrength.rawScore) : DASH} tone="foreground" />
            <span className="pb-1 font-mono text-xs uppercase tracking-wider text-primary">{readStrength.label}</span>
          </div>
          <Sub note={readStrength.meaning} />
        </Panel>
      </div>

      {/* 3. HOW BSE GOT THERE — Base → adjustments → Final ledger */}
      <Panel icon={Layers} title="How BSE Got There" span>
        <div className="space-y-1.5 font-mono text-sm">
          <LedgerRow label="Base model fair spread" value={formatSpreadTeam(context.baseFairHomeSpread, homeTeam, awayTeam)} strong />
          {context.adjustments.map((a) => (
            <LedgerRow
              key={a.key}
              label={a.label}
              value={a.points === 0 ? "0.0" : fmt(a.points, true)}
              muted={a.points === 0}
              note={a.detail}
            />
          ))}
          <div className="my-1 border-t border-border" />
          <LedgerRow
            label="Final BSE fair spread"
            value={formatSpreadTeam(context.finalFairHomeSpread, homeTeam, awayTeam)}
            strong
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          The base number is the frozen model. Context adjustments only apply current-game information the model does
          not already contain — so with no injury/news feed connected and weather being a totals effect, the final
          currently equals the base. Every line above shows exactly why.
        </p>
      </Panel>

      {/* 4. WHY BSE SEES IT — factor map / double-count guard */}
      <Panel icon={TrendingUp} title="Why BSE Sees It — Factor Map" span>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Every input, and whether it is already inside the frozen model (so re-adjusting would double count) or
          eligible to move the final number.
        </p>
        <ul className="mt-3 space-y-2">
          {factors.map((f) => (
            <li key={f.key} className="flex items-start gap-3 rounded-lg bg-background p-3">
              <DispositionIcon disposition={f.disposition} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground">{f.label}</span>
                  <DispositionBadge disposition={f.disposition} inBase={f.inBaseModel} />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.method}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* 5. MARKET INTELLIGENCE */}
      <Panel icon={LineChart} title="Market Intelligence" span>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-background p-4">
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Spread (home)</p>
            <dl className="mt-2 space-y-1.5 font-mono text-sm">
              <Row k="Open" v={fmt(marketIntel.openingSpread, true)} />
              <Row k="Now" v={fmt(marketIntel.currentSpread, true)} highlight />
              <Row k="Move" v={fmt(marketIntel.spreadMovement, true)} />
              <Row k="BSE base" v={fmt(marketIntel.baseFairHomeSpread, true)} />
              <Row k="BSE final" v={fmt(marketIntel.finalFairHomeSpread, true)} />
            </dl>
          </div>
          <div className="rounded-lg bg-background p-4">
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Edge vs BSE final</p>
            <dl className="mt-2 space-y-1.5 font-mono text-sm">
              <Row k="Edge at open" v={fmt(marketIntel.edgeAtOpenHome, true)} />
              <Row k="Edge now" v={fmt(marketIntel.edgeNowHome, true)} highlight />
              <Row k="Total open" v={fmt(marketIntel.openingTotal)} />
              <Row k="Total now" v={fmt(marketIntel.currentTotal)} />
              <Row k="Total move" v={fmt(marketIntel.totalMovement, true)} />
            </dl>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{marketIntel.moveNarrative}</p>
      </Panel>

      {/* 6. WEATHER — real impact calc */}
      <Panel icon={CloudSun} title="Weather">
        {weather.status === "ok" ? (
          <>
            <div className="flex items-end gap-3">
              <BigStat value={WEATHER_IMPACT_LABEL[weather.level]} tone={weather.level === "none" ? "foreground" : "primary"} />
              <span className="pb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">impact</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-foreground/80">{weather.reasoning}</p>
            {weatherDetail ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
                <Row k="Temp" v={weatherDetail.temperatureF != null ? `${Math.round(weatherDetail.temperatureF)}°F` : DASH} />
                <Row k="Wind" v={weatherDetail.windSpeedMph != null ? `${Math.round(weatherDetail.windSpeedMph)} mph` : DASH} />
                <Row k="Gusts" v={weatherDetail.windGustMph != null ? `${Math.round(weatherDetail.windGustMph)} mph` : DASH} />
                <Row k="Precip" v={weatherDetail.precipitationProbabilityPct != null ? `${weatherDetail.precipitationProbabilityPct}%` : DASH} />
              </dl>
            ) : null}
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">{weather.spreadNote}</p>
          </>
        ) : weather.status === "indoor" ? (
          <>
            <BigStat value="INDOOR" tone="foreground" />
            <Sub note="Dome / retractable roof — weather neutralized." />
          </>
        ) : weather.status === "pending_kickoff" ? (
          <>
            <BigStat value="PENDING" tone="muted" />
            <Sub note="Forecast refines as kickoff approaches; too far out for a reliable read." />
          </>
        ) : (
          <>
            <BigStat value={DASH} tone="muted" />
            <Sub note="DATA CURRENTLY UNAVAILABLE — no adjustment applied." />
          </>
        )}
      </Panel>

      {/* 7. INJURIES & PERSONNEL + NEWS — honest unavailable */}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel icon={Stethoscope} title="Injuries & Personnel">
          <UnavailableCard note={freshness.injuries.note} />
        </Panel>
        <Panel icon={Newspaper} title="News & Context">
          <UnavailableCard note={freshness.news.note} />
        </Panel>
      </div>

      {/* 8. ALTERNATE SPREAD LAB */}
      <Panel icon={Layers} title="Alternate Spread Lab" span>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-background p-4">
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Current market</p>
            <p className="mt-1 font-display text-lg font-bold text-foreground">
              {formatSpreadTeam(altLab.marketSpreadHome, homeTeam, awayTeam)}
            </p>
            <p className="mt-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">BSE fair</p>
            <p className="mt-1 font-display text-lg font-bold text-primary">
              {formatSpreadTeam(altLab.finalFairHomeSpread, homeTeam, awayTeam)}
            </p>
          </div>
          <div className="rounded-lg bg-background p-4">
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Value starts at</p>
            {altLab.thresholds ? (
              <dl className="mt-2 space-y-1.5 font-mono text-sm">
                <Row k={homeAbbr} v={altLab.thresholds.home.label} />
                <Row k={awayAbbr} v={altLab.thresholds.away.label} />
              </dl>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No fair line yet — thresholds unavailable.</p>
            )}
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
              The market number at which each side clears BSE&apos;s {altLab.thresholds?.gate ?? 1}-pt line-edge gate.
            </p>
          </div>
        </div>
        <div className="mt-3">
          <AltSpreadLab
            gameId={gameId}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
          />
        </div>
      </Panel>

      {/* 9. WHAT COULD CHANGE THE READ */}
      <Panel icon={AlertTriangle} title="What Could Change the Read" span>
        <ul className="space-y-2">
          {whatCouldChange.map((c, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${c.dataBacked ? "bg-primary" : "bg-muted-foreground/50"}`} />
              <span className={c.dataBacked ? "text-foreground/80" : "text-muted-foreground"}>{c.text}</span>
            </li>
          ))}
        </ul>
      </Panel>

      {/* 10. DATA FRESHNESS / PROVENANCE */}
      <Panel icon={Clock} title="Data Freshness & Sources" span>
        <dl className="grid gap-x-4 gap-y-2 font-mono text-xs sm:grid-cols-2">
          <Row k="BSE model run" v={freshness.model.at ? timeAgo(freshness.model.at) : "frozen (validation)"} />
          <Row k="DraftKings refresh" v={`${timeAgo(freshness.market.at)} (${freshness.market.status})`} />
          <Row
            k="Weather refresh"
            v={freshness.weather.status === "ok" || freshness.weather.status === "indoor" ? timeAgo(freshness.weather.at) : freshness.weather.status}
          />
          <Row k="Injury refresh" v="unavailable" />
          <Row k="News refresh" v="unavailable" />
          <Row k="Snapshot" v={timeAgo(snapshotAt)} />
        </dl>
        {freshness.model.hash ? (
          <p className="mt-3 font-mono text-[0.625rem] text-muted-foreground">model {freshness.model.hash.slice(0, 12)}</p>
        ) : null}
      </Panel>
    </div>
  )
}

/* --------------------------------- atoms -------------------------------- */

function Panel({
  icon: Icon,
  title,
  span,
  children,
}: {
  icon: typeof LineChart
  title: string
  span?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={span ? "w-full" : undefined}>
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

function LedgerRow({
  label,
  value,
  strong,
  muted,
  note,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
  note?: string | null
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`${strong ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "text-foreground/80"}`}>
        {label}
        {note ? <span className="ml-2 text-[0.625rem] uppercase tracking-wider text-muted-foreground">{note}</span> : null}
      </span>
      <span className={strong ? "font-bold text-primary" : muted ? "text-muted-foreground" : "text-foreground"}>{value}</span>
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
  const cls = tone === "primary" ? "text-primary" : tone === "foreground" ? "text-foreground" : "text-muted-foreground"
  return <p className={`font-display text-3xl font-bold tabular-nums ${cls}`}>{value}</p>
}

function Sub({ note }: { note: string }) {
  return <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>
}

function UnavailableCard({ note }: { note: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background p-4">
      <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Data currently unavailable
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {note} No adjustment is applied and nothing is inferred from the absence of data.
      </p>
    </div>
  )
}

function DispositionIcon({ disposition }: { disposition: string }) {
  if (disposition === "active") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
  if (disposition === "in_base") return <MinusCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
  if (disposition === "data_unavailable" || disposition === "not_wired")
    return <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" />
  return <MinusCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
}

function DispositionBadge({ disposition, inBase }: { disposition: string; inBase: boolean }) {
  const map: Record<string, { text: string; cls: string }> = {
    active: { text: "Active", cls: "border-primary/40 bg-primary/10 text-primary" },
    in_base: { text: "Already in base model", cls: "border-border bg-background text-muted-foreground" },
    totals_only: { text: "Totals effect · 0 side", cls: "border-border bg-background text-muted-foreground" },
    data_unavailable: { text: "Data unavailable", cls: "border-dashed border-border bg-background text-muted-foreground" },
    not_wired: { text: "Not wired", cls: "border-dashed border-border bg-background text-muted-foreground" },
  }
  const meta = map[disposition] ?? map.in_base
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider ${meta.cls}`}>
      {meta.text}
    </span>
  )
}
