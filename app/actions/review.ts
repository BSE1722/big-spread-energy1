"use server"

import { revalidatePath } from "next/cache"
import { getAdmin } from "@/lib/admin-auth"
import { recordTicket, gradeReviewFinals } from "@/lib/review/service"
import type { RecordTicketInput } from "@/lib/review/types"

/**
 * Admin-only server actions for the Postgame BSE Review.
 *
 * EVERY action re-checks admin status server-side via getAdmin(). The client
 * supplies the frozen pregame values (the analyzer produced them), but the
 * server owns the lock hash, fragility computation, and all grading — the
 * client can never influence a graded outcome.
 */

type ActionResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string }

export async function recordReviewTicket(
  input: RecordTicketInput,
): Promise<ActionResult<{ ticketNumber: number }>> {
  const admin = await getAdmin()
  if (!admin.ok) return { ok: false, error: "Unauthorized" }

  const result = await recordTicket({ ...input, createdBy: admin.userId })
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath("/admin/review")
  return {
    ok: true,
    message: `Recorded Ticket #${String(result.ticket.ticketNumber).padStart(3, "0")}.`,
    data: { ticketNumber: result.ticket.ticketNumber },
  }
}

export async function gradeReviewTickets(): Promise<ActionResult> {
  const admin = await getAdmin()
  if (!admin.ok) return { ok: false, error: "Unauthorized" }

  try {
    const r = await gradeReviewFinals()
    revalidatePath("/admin/review")
    return {
      ok: true,
      message: `Graded ${r.gradedLegs} leg(s), completed ${r.gradedTickets} ticket(s). ${r.cfbdRequests} CFBD request(s). ${r.reason}`,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Grading failed" }
  }
}
