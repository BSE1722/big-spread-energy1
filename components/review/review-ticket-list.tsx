import Link from "next/link"
import type { ReviewTicket } from "@/lib/review/types"
import type { TicketPostmortem } from "@/lib/review/postmortem"
import { fmtTicketNo, fragilityChipClass, gradeChipClass } from "@/components/review/review-format"

export function ReviewTicketList({
  rows,
}: {
  rows: Array<{ ticket: ReviewTicket; postmortem: TicketPostmortem }>
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No tickets recorded yet. Record one on the right, or save a ticket from the analyzer.
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map(({ ticket, postmortem }) => {
        const graded = ticket.status === "graded"
        const record =
          graded && ticket.legsWon != null
            ? `${ticket.legsWon}-${ticket.legsLost}${ticket.legsPushed ? `-${ticket.legsPushed}` : ""}`
            : ticket.recordedWins != null
              ? `${ticket.recordedWins}-${ticket.recordedLosses ?? 0} (recorded)`
              : null
        return (
          <li key={ticket.id}>
            <Link
              href={`/admin/review?ticket=${ticket.ticketNumber}`}
              className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-muted-foreground/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    {fmtTicketNo(ticket.ticketNumber)} · {ticket.season} Wk {ticket.week}
                  </p>
                  <p className="mt-1 truncate font-display text-lg font-bold text-foreground">
                    {ticket.title ?? `${ticket.legCount}-leg parlay`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {graded && ticket.overallGrade ? (
                    <span className={gradeChipClass(ticket.overallGrade)}>
                      {ticket.overallGrade === "win" ? "CASHED" : "LOST"}
                    </span>
                  ) : (
                    <span className="rounded border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      Pending
                    </span>
                  )}
                  {record && <span className="font-mono text-xs text-muted-foreground">{record}</span>}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  {ticket.source === "analyzer" ? "From analyzer" : "Admin"}
                </span>
                {ticket.fragilityTier && (
                  <span className={fragilityChipClass(ticket.fragilityTier)}>
                    Fragility: {ticket.fragilityTier}
                  </span>
                )}
                {graded && postmortem.unratedLegCount > 0 && (
                  <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                    {postmortem.unratedLegCount} unrated
                  </span>
                )}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
