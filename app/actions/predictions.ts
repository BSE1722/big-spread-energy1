"use server"

import { revalidatePath } from "next/cache"
import { getAdmin } from "@/lib/admin-auth"
import {
  publishPick,
  addCorrection,
  gradePending,
  type PublishResult,
} from "@/lib/predictions/service"
import type { Market, PickSide } from "@/lib/predictions/grade"

/**
 * Server actions for the admin Official BSE Picks UI.
 *
 * EVERY action re-checks admin status server-side via getAdmin(). The client
 * never supplies the lock hash, frozen line, price, or model fields — the
 * server derives all of those from the durable snapshot at publish time.
 */

type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

export async function publishOfficialPick(input: {
  gameId: string
  market: Market
  pickSide: PickSide
}): Promise<PublishResult> {
  const admin = await getAdmin()
  if (!admin.ok) return { ok: false, error: "Unauthorized" }

  const result = await publishPick({
    gameId: input.gameId,
    market: input.market,
    pickSide: input.pickSide,
    publishedBy: admin.userId,
  })

  if (result.ok) {
    revalidatePath("/performance")
    revalidatePath("/admin")
  }
  return result
}

export async function submitCorrection(input: {
  predictionId: string
  field: string
  originalValue: string | null
  correctedValue: string | null
  reason: string
}): Promise<ActionResult> {
  const admin = await getAdmin()
  if (!admin.ok) return { ok: false, error: "Unauthorized" }

  const result = await addCorrection({
    predictionId: input.predictionId,
    field: input.field,
    originalValue: input.originalValue,
    correctedValue: input.correctedValue,
    reason: input.reason,
    adminUserId: admin.userId,
  })
  if (!result.ok) return result

  revalidatePath("/performance")
  revalidatePath("/admin")
  return { ok: true, message: "Correction recorded. The original remains on the public record." }
}

export async function triggerManualGrading(): Promise<ActionResult> {
  const admin = await getAdmin()
  if (!admin.ok) return { ok: false, error: "Unauthorized" }

  try {
    const result = await gradePending("manual")
    revalidatePath("/performance")
    revalidatePath("/admin")
    return {
      ok: true,
      message: `Graded ${result.gradedCount} pick(s). ${result.cfbdRequests} CFBD request(s), ${result.weekGroups} week group(s). ${result.reason}`,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Grading failed" }
  }
}
