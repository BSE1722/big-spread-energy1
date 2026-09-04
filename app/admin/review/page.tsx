import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { getAdmin } from "@/lib/admin-auth"
import { listTickets, getTicketWithLegs, getTicketsWithLegs } from "@/lib/review/service"
import { buildTicketPostmortem } from "@/lib/review/postmortem"
import { ReviewRecorder } from "@/components/review/review-recorder"
import { ReviewGradeButton } from "@/components/review/review-grade-button"
import { ReviewTicketList } from "@/components/review/review-ticket-list"
import { ReviewTicketDetail } from "@/components/review/review-ticket-detail"

export const metadata: Metadata = {
  title: "Postgame Review — Big Spread Energy",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>
}) {
  const admin = await getAdmin()
  if (!admin.ok) notFound()

  const { ticket: ticketParam } = await searchParams
  const selectedNumber = ticketParam ? Number.parseInt(ticketParam, 10) : null

  const tickets = await listTickets()
  const legsByTicket = await getTicketsWithLegs(tickets.map((t) => t.id))

  // List rows carry a lightweight postmortem summary for the win/loss chips.
  const rows = tickets.map((t) => ({
    ticket: t,
    postmortem: buildTicketPostmortem(t, legsByTicket.get(t.id) ?? []),
  }))

  let detail: Awaited<ReturnType<typeof getTicketWithLegs>> = null
  let detailPostmortem: ReturnType<typeof buildTicketPostmortem> | null = null
  if (selectedNumber != null && Number.isFinite(selectedNumber)) {
    detail = await getTicketWithLegs(selectedNumber)
    if (detail) detailPostmortem = buildTicketPostmortem(detail.ticket, detail.legs)
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Admin · {admin.email}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground text-balance">
          Postgame BSE Review
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
          An honest validation record. Analyzed tickets are frozen at analysis time, graded from official
          CFBD finals, and each gets a deterministic postmortem. Nothing here retrains the frozen model,
          fabricates a BSE Rating, or auto-blames variance.
        </p>
        <div className="mt-4">
          <Link
            href="/admin"
            className="font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to Control Room
          </Link>
        </div>
      </header>

      {detail && detailPostmortem ? (
        <ReviewTicketDetail ticket={detail.ticket} legs={detail.legs} postmortem={detailPostmortem} />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold text-foreground">
                Recorded Tickets ({tickets.length})
              </h2>
              <ReviewGradeButton />
            </div>
            <ReviewTicketList rows={rows} />
          </section>

          <section>
            <h2 className="mb-4 font-display text-xl font-bold text-foreground">Record a Ticket</h2>
            <ReviewRecorder />
          </section>
        </div>
      )}
    </main>
  )
}
