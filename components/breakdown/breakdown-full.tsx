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
  ScrollText,
  FileText,
  Swords,
  ChevronDown,
  Cloudy,
} from "lucide-react"
import { formatSpreadTeam } from "@/lib/bse/context-engine"
import { WEATHER_IMPACT_LABEL } from "@/lib/bse/weather-impact"
import type { FactorStatus, KeyFactor } from "@/lib/breakdown/narrative"
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
  like: "border-primary bg-primary/15 text-foreground",
  lean: "border-primary/40 bg-primary/10 text-foreground",
  pass: "border-border bg-card text-foreground",
  neutral: "border-border bg-card text-muted-foreground",
}

/**
 * The full unlocked Pro breakdown — a plain-English game report, not a database
 * dump. Everything is assembled server-side in lib/breakdown/assemble.ts and
 * phrased in lib/breakdown/narrative.ts. The customer hierarchy leads with the
 * conclusion (verdict → number → the read → key factors) and pushes the audit
 * trail (factor map, full ledger, freshness) into an expandable Deep Dive.
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
    narrative,
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
  const matchupWhy = narrative.why.find((f) => f.key === "matchup")
  const readParagraphs = narrative.bseRead.split("\n\n").filter(Boolean)

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
      {/* 1. VERDICT — plain-English headline + one-line reason */}
      <section className={`rounded-xl border p-5 ${VERDICT_TONE[narrative.verdict.tone] ?? VERDICT_TONE.neutral}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Target className="size-4 text-primary" />
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">BSE Verdict</h2>
          {narrative.verdict.flags.map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[0.5625rem] font-bold uppercase tracking-wider text-primary"
            >
              <Cloudy className="size-3" aria-hidden="true" />
              {f}
            </span>
          ))}
        </div>
        <p className="mt-2 font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          {narrative.verdict.headline}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{narrative.verdict.plain}</p>
      </section>

      {/* 2. FINAL FAIR vs MARKET + EDGE */}
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

      {/* 3. THE BSE READ — the story, in plain English */}
      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-primary" />
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">The BSE Read</h2>
        </div>
        <div className="mt-3 space-y-3">
          {readParagraphs.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-foreground/90">
              {p}
            </p>
          ))}
        </div>
      </section>

      {/* 4. KEY FACTORS — the handful of things that actually drive the read */}
      <Panel icon={ScrollText} title="Key Factors" span>
        <ul className="space-y-2.5">
          {narrative.keyFactors.map((f) => (
            <li key={f.key} className="flex items-start gap-3 rounded-lg bg-background p-3.5">
              <KeyFactorIcon tone={f.tone} />
              <div className="min-w-0">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                  {f.label}
                </span>
                <p className="mt-1 text-sm leading-relaxed text-foreground/80">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* 5. WEATHER + INJURIES */}
      <div className="grid gap-4 md:grid-cols-2">
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
              <Sub note="Dome / retractable roof — weather is off the table." />
            </>
          ) : weather.status === "pending_kickoff" ? (
            <>
              <BigStat value="PENDING" tone="muted" />
              <Sub note="Kickoff time isn't locked yet, so there's no reliable game-hour forecast. Nothing is assumed." />
            </>
          ) : weather.status === "stale" ? (
            <>
              <BigStat value="STALE" tone="muted" />
              <Sub note="The last forecast is out of date and hasn't refreshed recently, so BSE isn't presenting it as current — treated as unavailable, no weather assumption made." />
              {weatherDetail?.fetchedAt ? (
                <p className="mt-2 font-mono text-[0.625rem] text-muted-foreground">
                  last reading {timeAgo(weatherDetail.fetchedAt)}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <BigStat value={DASH} tone="muted" />
              <Sub note="Data currently unavailable — no weather call, and no assumption of clear skies." />
            </>
          )}
        </Panel>
        <Panel icon={Stethoscope} title="Injuries & Personnel">
          <UnavailableCard note={freshness.injuries.note} />
        </Panel>
      </div>

      {/* 6. MARKET MOVEMENT */}
      <Panel icon={LineChart} title="Market Movement" span>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-background p-4">
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Spread (home)</p>
            <dl className="mt-2 space-y-1.5 font-mono text-sm">
              <Row k="Open" v={fmt(marketIntel.openingSpread, true)} />
              <Row k="Now" v={fmt(marketIntel.currentSpread, true)} highlight />
              <Row k="Move" v={fmt(marketIntel.spreadMovement, true)} />
              <Row k="BSE final" v={fmt(marketIntel.finalFairHomeSpread, true)} />
            </dl>
          </div>
          <div className="rounded-lg bg-background p-4">
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">Edge & totals</p>
            <dl className="mt-2 space-y-1.5 font-mono text-sm">
              <Row k="Edge at open" v={fmt(marketIntel.edgeAtOpenHome, true)} />
              <Row k="Edge now" v={fmt(marketIntel.edgeNowHome, true)} highlight />
              <Row k="Total open" v={fmt(marketIntel.openingTotal)} />
              <Row k="Total now" v={fmt(marketIntel.currentTotal)} />
              <Row k="Total move" v={fmt(marketIntel.totalMovement, true)} />
            </dl>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">{marketIntel.moveNarrative}</p>
      </Panel>

      {/* 7. MATCHUP + NEWS */}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel icon={Swords} title="Matchup">
          <p className="text-sm leading-relaxed text-foreground/80">
            {matchupWhy?.text ?? "Matchup detail unavailable."}
          </p>
          <p className="mt-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
            Already inside the BSE number — shown, never double-counted
          </p>
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
              The market number at which each side clears BSE&apos;s {altLab.thresholds?.gate ?? 1}-pt line-value gate.
            </p>
          </div>
        </div>
        <div className="mt-3">
          <AltSpreadLab gameId={gameId} homeTeam={homeTeam} awayTeam={awayTeam} homeAbbr={homeAbbr} awayAbbr={awayAbbr} />
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

      {/* 10. DEEP DIVE / METHODOLOGY — expandable audit trail for advanced users */}
      <details className="group rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <span className="font-display text-sm font-bold uppercase tracking-widest text-foreground">
              Deep Dive & Methodology
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-6 border-t border-border p-5">
          {/* Compliance / in-validation note */}
          <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-foreground/80">{inValidationNote}</p>
          </div>

          {/* Why BSE reads it this way — full per-factor prose */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Why BSE Reads It This Way</h4>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              A written read on every input feeding the number — what BSE evaluated, what it found, and whether it moved
              the number or was already inside the model. Missing feeds are labelled, never fabricated.
            </p>
            <ul className="mt-3 space-y-2.5">
              {narrative.why.map((f) => (
                <li key={f.key} className="rounded-lg bg-background p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusIcon status={f.status} />
                    <span className="font-mono text-xs font-semibold text-foreground">{f.label}</span>
                    <StatusBadge status={f.status} label={f.statusLabel} />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/75">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Base → Final ledger */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">How BSE Got There</h4>
            <div className="mt-3 space-y-1.5 font-mono text-sm">
              <LedgerRow label="Base model fair spread" value={narrative.ledger.baseFairLabel} strong />
              {narrative.ledger.adjustments.map((a) => (
                <div key={a.key} className="flex items-center justify-between gap-3">
                  <span className="flex flex-wrap items-center gap-2 text-foreground/80">
                    {a.label}
                    <StatusBadge status={a.status} label={a.statusLabel} />
                  </span>
                  <span className={a.points === 0 ? "text-muted-foreground" : "font-semibold text-primary"}>
                    {a.points === 0 ? "+0.0" : fmt(a.points, true)}
                  </span>
                </div>
              ))}
              <div className="my-1 border-t border-border" />
              <LedgerRow label="Final BSE fair spread" value={narrative.ledger.finalFairLabel} strong />
              <LedgerRow label="Current market spread" value={narrative.ledger.marketLabel} />
              <LedgerRow label="Final edge" value={narrative.ledger.finalEdgeLabel} />
              <LedgerRow label="BSE rating" value={narrative.ledger.rating != null ? String(narrative.ledger.rating) : DASH} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              The base number is the frozen model. Context only adjusts for current-game information the model does not
              already contain — so with no injury/news feed connected and weather being a scoring (totals) effect, the
              final currently equals the base. Every line shows exactly why.
            </p>
          </div>

          {/* Factor map / double-count guard */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Factor Map</h4>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Every input, and whether it is already inside the frozen model (so re-adjusting would double count) or is
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
          </div>

          {/* Data freshness / provenance */}
          <div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              <h4 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Data Freshness & Sources</h4>
            </div>
            <dl className="mt-3 grid gap-x-4 gap-y-2 font-mono text-xs sm:grid-cols-2">
              <Row k="BSE model run" v={freshness.model.at ? timeAgo(freshness.model.at) : "frozen (validation)"} />
              <Row k="DraftKings refresh" v={`${timeAgo(freshness.market.at)} (${freshness.market.status})`} />
              <Row
                k="Weather refresh"
                v={
                  freshness.weather.status === "ok" || freshness.weather.status === "indoor"
                    ? timeAgo(freshness.weather.at)
                    : freshness.weather.status === "stale"
                      ? `${timeAgo(freshness.weather.at)} (stale)`
                      : freshness.weather.status
                }
              />
              <Row k="Injury refresh" v="unavailable" />
              <Row k="News refresh" v="unavailable" />
              <Row k="Snapshot" v={timeAgo(snapshotAt)} />
            </dl>
            {freshness.model.hash ? (
              <p className="mt-3 font-mono text-[0.625rem] text-muted-foreground">model {freshness.model.hash.slice(0, 12)}</p>
            ) : null}
          </div>
        </div>
      </details>
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

function KeyFactorIcon({ tone }: { tone: KeyFactor["tone"] }) {
  if (tone === "pro") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
  if (tone === "con") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
  return <MinusCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
}

function StatusIcon({ status }: { status: FactorStatus }) {
  if (status === "ADJUSTED") return <CheckCircle2 className="size-4 shrink-0 text-primary" />
  if (status === "NO_MATERIAL_IMPACT") return <MinusCircle className="size-4 shrink-0 text-muted-foreground" />
  if (status === "IN_BASE") return <Layers className="size-4 shrink-0 text-muted-foreground" />
  return <XCircle className="size-4 shrink-0 text-muted-foreground/70" />
}

function StatusBadge({ status, label }: { status: FactorStatus; label: string }) {
  const cls: Record<FactorStatus, string> = {
    ADJUSTED: "border-primary/40 bg-primary/10 text-primary",
    NO_MATERIAL_IMPACT: "border-border bg-background text-muted-foreground",
    IN_BASE: "border-border bg-background text-muted-foreground",
    NOT_WIRED: "border-dashed border-border bg-background text-muted-foreground",
    DATA_UNAVAILABLE: "border-dashed border-border bg-background text-muted-foreground",
  }
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[0.5625rem] uppercase tracking-wider ${cls[status]}`}>
      {label}
    </span>
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
