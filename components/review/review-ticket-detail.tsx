import Link from "next/link"
import type { ReviewLeg, ReviewTicket } from "@/lib/review/types"
import type { TicketPostmortem } from "@/lib/review/postmortem"
import {
  fmtPrice,
  fmtPts,
  fmtSigned,
  fmtTicketNo,
  fragilityChipClass,
  gradeChipClass,
  missKindLabel,
} from "@/components/review/review-format"

/**
 * Full ticket detail: the frozen pregame snapshot, the graded results, and the
 * deterministic postmortem. Everything shown is either a recorded pregame value
 * or a value derived from official finals — no live recomputation.
 */
export function ReviewTicketDetail({
  ticket,
  legs,
  postmortem,
}: {
  ticket: ReviewTicket
  legs: ReviewLeg[]
  postmortem: TicketPostmortem
}) {
  const graded = ticket.status === "graded"
  const ordered = [...legs].sort((a, b) => a.legIndex - b.legIndex)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/review"
          className="font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        >
          ← All tickets
        </Link>
      </div>

      {/* Header */}
      <header className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {fmtTicketNo(ticket.ticketNumber)} · {ticket.season} Week {ticket.week} ·{" "}
              {ticket.source === "analyzer" ? "From analyzer" : "Admin-recorded"}
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-foreground">
              {ticket.title ?? `${ticket.legCount}-leg parlay`}
            </h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Analyzed {new Date(ticket.analyzedAt).toLocaleString()}
              {ticket.combinedPriceAmerican != null && <> · Combined {fmtPrice(ticket.combinedPriceAmerican)}</>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {graded && ticket.overallGrade ? (
              <span className={`${gradeChipClass(ticket.overallGrade)} text-sm`}>
                {ticket.overallGrade === "win" ? "TICKET CASHED" : "TICKET LOST"}
              </span>
            ) : (
              <span className="rounded border border-border px-3 py-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                Pending grading
              </span>
            )}
            {graded && ticket.legsWon != null && (
              <span className="font-mono text-sm text-foreground">
                {ticket.legsWon}-{ticket.legsLost}
                {ticket.legsPushed ? `-${ticket.legsPushed}` : ""} legs
                {ticket.individualWinRate != null && (
                  <span className="text-muted-foreground"> · {Math.round(ticket.individualWinRate * 100)}% individual</span>
                )}
              </span>
            )}
            {ticket.recordedWins != null && (
              <span className="font-mono text-[11px] text-muted-foreground">
                Recorded: {ticket.recordedWins}-{ticket.recordedLosses ?? 0}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Legs: pregame snapshot + graded result */}
      <section>
        <h3 className="mb-3 font-display text-lg font-bold text-foreground">Legs</h3>
        <ul className="flex flex-col gap-3">
          {ordered.map((leg) => (
            <LegCard key={leg.id} leg={leg} />
          ))}
        </ul>
      </section>

      {/* Postmortem */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-display text-lg font-bold text-foreground">Postmortem</h3>
        {!graded && (
          <p className="mt-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            This ticket is not fully graded yet. Run “Grade finals” once the games are official — the
            postmortem fills in from real scores.
          </p>
        )}

        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <PostSection title="What BSE got right" items={postmortem.gotRight} emptyText="No graded winning legs yet." />
          <PostSection title="What BSE got wrong" items={postmortem.gotWrong} emptyText="No graded losing legs." tone="bad" />
          <PostSection
            title="Warning signs that mattered"
            items={postmortem.warningSignsThatMattered}
            emptyText="No flagged leg lost — or nothing was flagged pregame."
          />
          <AltProtectionCard summary={postmortem.altProtection} />
        </div>

        {/* Miss vs variance per lost leg */}
        <MissBreakdown postmortem={postmortem} />

        {/* Calibration */}
        <Calibration postmortem={postmortem} />

        {/* Fragility */}
        <div className="mt-6 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <h4 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Ticket fragility (pregame)
            </h4>
            {postmortem.fragility.tier && (
              <span className={fragilityChipClass(postmortem.fragility.tier)}>
                {postmortem.fragility.tier}
                {postmortem.fragility.score != null && ` · ${postmortem.fragility.score}`}
              </span>
            )}
          </div>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            {postmortem.fragility.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>

        <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
          {postmortem.disclaimer}
        </p>
      </section>
    </div>
  )
}

function LegCard({ leg }: { leg: ReviewLeg }) {
  const graded = leg.status === "graded"
  const flags = Array.isArray(leg.riskFlags) ? (leg.riskFlags as Array<{ label: string }>) : []
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Leg {leg.legIndex + 1} · {leg.awayTeam} @ {leg.homeTeam}
          </p>
          <p className="mt-1 font-display text-lg font-bold text-foreground">{leg.pickLabel}</p>
        </div>
        {graded && leg.grade ? (
          <span className={gradeChipClass(leg.grade)}>{leg.grade.toUpperCase()}</span>
        ) : (
          <span className="rounded border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            Pending
          </span>
        )}
      </div>

      {/* Pregame snapshot */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Field label="Line" value={fmtSigned(leg.lineValue)} />
        <Field label="Price" value={fmtPrice(leg.priceAmerican)} />
        <Field
          label="BSE Rating"
          value={leg.bseRating != null ? String(Math.round(leg.bseRating)) : "Unrated"}
          muted={leg.bseRating == null}
        />
        <Field label="Line edge" value={leg.lineEdge != null ? fmtPts(leg.lineEdge) : "—"} />
      </div>
      {leg.classification && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          Read: {leg.classification}
          {leg.confidenceRead ? ` · ${leg.confidenceRead}` : ""}
        </p>
      )}
      {flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {flags.map((f, i) => (
            <span key={i} className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
              ⚑ {f.label}
            </span>
          ))}
        </div>
      )}

      {/* Graded result */}
      {graded && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Field label="Final" value={`${leg.awayScore} – ${leg.homeScore}`} />
            <Field label="Margin vs line" value={fmtPts(leg.marginVsSpread)} tone={marginTone(leg.marginVsSpread)} />
            <Field
              label="Alt would’ve won"
              value={leg.altWouldHaveWon == null ? "—" : leg.altWouldHaveWon ? "Yes" : "No"}
            />
            <Field label="Units" value={leg.unitsDelta != null ? fmtSigned(leg.unitsDelta) : "—"} />
          </div>
          {leg.altProtectionOutcome && leg.altProtectionOutcome !== "na" && (
            <p className="mt-2 text-xs text-muted-foreground">{altOutcomeText(leg.altProtectionOutcome)}</p>
          )}
        </div>
      )}
    </li>
  )
}

function MissBreakdown({ postmortem }: { postmortem: TicketPostmortem }) {
  const lost = postmortem.legs.filter((l) => l.graded && l.grade === "loss")
  if (lost.length === 0) return null
  return (
    <div className="mt-6 border-t border-border pt-4">
      <h4 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
        Model miss vs variance
      </h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Transparent heuristic from recorded pregame risk flags and the margin missed — a signal, never a verdict.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {lost.map((l) => (
          <li key={l.legIndex} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-semibold text-foreground">{l.pickLabel}</span>
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-foreground">
                {missKindLabel(l.missKind)}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{l.missExplanation}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Calibration({ postmortem }: { postmortem: TicketPostmortem }) {
  const hasRated = postmortem.calibration.some((b) => b.sample > 0)
  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <h4 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
          Confidence calibration
        </h4>
        {postmortem.unratedLegCount > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {postmortem.unratedLegCount} unrated leg(s) excluded
          </span>
        )}
      </div>
      {!hasRated ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No legs on this ticket carried a real recorded BSE Rating, so there is nothing to calibrate. Ratings are
          never fabricated to fill these buckets.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Rating</th>
                <th className="py-2 pr-4">Sample</th>
                <th className="py-2 pr-4">W-L-P</th>
                <th className="py-2 pr-4">Cover rate</th>
                <th className="py-2">Units</th>
              </tr>
            </thead>
            <tbody>
              {postmortem.calibration.map((b) => (
                <tr key={b.label} className="border-b border-border/60">
                  <td className="py-2 pr-4 font-mono text-foreground">{b.label}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{b.sample || "—"}</td>
                  <td className="py-2 pr-4 text-foreground">
                    {b.sample ? `${b.wins}-${b.losses}${b.pushes ? `-${b.pushes}` : ""}` : "—"}
                  </td>
                  <td className="py-2 pr-4 text-foreground">
                    {b.coverRate != null ? `${Math.round(b.coverRate * 100)}%` : "—"}
                  </td>
                  <td className={`py-2 ${b.unitsDelta > 0 ? "text-primary" : b.unitsDelta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {b.sample ? fmtSigned(b.unitsDelta) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AltProtectionCard({ summary }: { summary: TicketPostmortem["altProtection"] }) {
  const rows: Array<[string, number]> = [
    ["Saved by alt", summary.saved],
    ["Improved (not needed)", summary.improvedNotNeeded],
    ["Still lost", summary.stillLost],
    ["Fav lost, no protection", summary.favoriteLostNoProtection],
  ]
  const any = rows.some(([, n]) => n > 0)
  return (
    <div>
      <h4 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
        Alt-line protection
      </h4>
      {!any ? (
        <p className="mt-2 text-sm text-muted-foreground">No alternate-spread protection recorded on these legs.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {rows.map(([label, n]) => (
            <li key={label} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono text-foreground">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PostSection({
  title,
  items,
  emptyText,
  tone,
}: {
  title: string
  items: string[]
  emptyText: string
  tone?: "bad"
}) {
  return (
    <div>
      <h4 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
          {items.map((it, i) => (
            <li key={i} className={tone === "bad" ? "text-foreground" : "text-foreground"}>
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Field({ label, value, muted, tone }: { label: string; value: string; muted?: boolean; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : muted ? "text-muted-foreground" : "text-foreground"
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-mono text-sm ${color}`}>{value}</p>
    </div>
  )
}

function marginTone(m: number | null): "good" | "bad" | undefined {
  if (m == null) return undefined
  if (m > 0) return "good"
  if (m < 0) return "bad"
  return undefined
}

function altOutcomeText(outcome: string): string {
  switch (outcome) {
    case "saved":
      return "The recorded alternate spread would have covered — alt-line protection would have saved this leg."
    case "improved_not_needed":
      return "Leg won at the main number; the alternate wasn’t needed."
    case "still_lost":
      return "The picked side won outright but neither the main nor the recorded alt number covered."
    case "favorite_lost_no_protection":
      return "The picked side lost outright — no alternate spread could have protected this leg."
    default:
      return ""
  }
}
