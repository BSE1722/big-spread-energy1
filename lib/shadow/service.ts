import "server-only"
import { pool } from "@/lib/db"

/**
 * READ-ONLY data access for the SHADOW VALIDATION dashboard.
 *
 * This module ONLY reads. It never writes signals or grades — capture and
 * grading are done by the Node jobs in scripts/hist/final. The dashboard is a
 * window onto prospective results for the ONE frozen candidate; it is not a
 * deployment surface and creates no picks.
 */

export interface FrozenCandidate {
  candidateId: string
  modelHash: string
  family: string
  model: string
  threshold: number
  featureVersion: string
  hyperparams: Record<string, unknown>
  trainSeasons: number[]
  trainingRowCount: number
  frozenAt: string
}

export interface ShadowStats {
  signals: number
  graded: number
  wins: number
  losses: number
  pushes: number
  atsPct: number | null // over decided (non-push) bets
  roi: number | null // flat -110 unit staking
  avgClv: number | null
  medianClv: number | null
  pctPositiveClv: number | null
}

export interface WeekRow extends ShadowStats {
  season: number
  week: number
}

export interface SignalRow {
  id: number
  season: number
  week: number
  homeTeam: string
  awayTeam: string
  side: string
  predictedEdge: number
  signalSpreadHome: number
  signalPrice: number | null
  signalLineAt: string
  kickoffAt: string | null
  atsResult: string | null
  atsCoverMargin: number | null
  clvPoints: number | null
  finalPregameSpreadHome: number | null
}

/** The single frozen candidate (there is exactly one). Null if not frozen yet. */
export async function getFrozenCandidate(): Promise<FrozenCandidate | null> {
  const { rows } = await pool.query(
    `select model_hash, candidate_id, family, model, threshold, feature_version,
            hyperparams, train_seasons, training_row_count, frozen_at
       from bse_frozen_candidate order by frozen_at desc limit 1`,
  )
  if (!rows.length) return null
  const r = rows[0]
  return {
    modelHash: r.model_hash,
    candidateId: r.candidate_id,
    family: r.family,
    model: r.model,
    threshold: Number(r.threshold),
    featureVersion: r.feature_version,
    hyperparams: r.hyperparams,
    trainSeasons: r.train_seasons,
    trainingRowCount: r.training_row_count,
    frozenAt: new Date(r.frozen_at).toISOString(),
  }
}

/** Flat -110 ROI over DECIDED bets: win +0.909u, loss -1u, push 0u. */
function roiFrom(wins: number, losses: number, pushes: number): number | null {
  const staked = wins + losses + pushes
  if (staked === 0) return null
  const profit = wins * (100 / 110) - losses * 1
  return profit / staked
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function statsFrom(grades: { ats_result: string | null; clv_points: number | null }[], signalCount: number): ShadowStats {
  let wins = 0, losses = 0, pushes = 0
  const clvs: number[] = []
  for (const g of grades) {
    if (g.ats_result === "WIN") wins++
    else if (g.ats_result === "LOSS") losses++
    else if (g.ats_result === "PUSH") pushes++
    if (g.clv_points != null) clvs.push(Number(g.clv_points))
  }
  const decided = wins + losses
  return {
    signals: signalCount,
    graded: wins + losses + pushes,
    wins, losses, pushes,
    atsPct: decided ? wins / decided : null,
    roi: roiFrom(wins, losses, pushes),
    avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
    medianClv: median(clvs),
    pctPositiveClv: clvs.length ? clvs.filter((c) => c > 0).length / clvs.length : null,
  }
}

/** Overall prospective results for the frozen candidate. */
export async function getOverallStats(modelHash: string): Promise<ShadowStats> {
  const signalCount = Number(
    (await pool.query(`select count(*)::int c from bse_shadow_signal where model_hash = $1`, [modelHash])).rows[0].c,
  )
  const { rows } = await pool.query(
    `select gr.ats_result, gr.clv_points
       from bse_shadow_signal s
       join bse_shadow_grade gr on gr.signal_id = s.id
      where s.model_hash = $1`,
    [modelHash],
  )
  return statsFrom(rows, signalCount)
}

/** Per-week breakdown. */
export async function getWeeklyStats(modelHash: string): Promise<WeekRow[]> {
  const { rows: sigCounts } = await pool.query(
    `select season, week, count(*)::int c from bse_shadow_signal where model_hash=$1 group by season, week`,
    [modelHash],
  )
  const countByKey = new Map<string, number>()
  for (const r of sigCounts) countByKey.set(`${r.season}-${r.week}`, r.c)

  const { rows } = await pool.query(
    `select s.season, s.week, gr.ats_result, gr.clv_points
       from bse_shadow_signal s
       join bse_shadow_grade gr on gr.signal_id = s.id
      where s.model_hash = $1`,
    [modelHash],
  )
  const byKey = new Map<string, { ats_result: string | null; clv_points: number | null }[]>()
  for (const r of rows) {
    const k = `${r.season}-${r.week}`
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k)!.push(r)
  }
  const keys = new Set<string>([...countByKey.keys(), ...byKey.keys()])
  const out: WeekRow[] = []
  for (const k of keys) {
    const [season, week] = k.split("-").map(Number)
    const grades = byKey.get(k) ?? []
    out.push({ season, week, ...statsFrom(grades, countByKey.get(k) ?? grades.length) })
  }
  return out.sort((a, b) => a.season - b.season || a.week - b.week)
}

/** Individual signals with their grade (most recent first). */
export async function listSignals(modelHash: string, limit = 200): Promise<SignalRow[]> {
  const { rows } = await pool.query(
    `select s.id, s.season, s.week, s.home_team, s.away_team, s.side, s.predicted_edge,
            s.signal_line_spread_home, s.signal_line_price, s.signal_line_at, s.kickoff_at,
            gr.ats_result, gr.ats_cover_margin, gr.clv_points, gr.final_pregame_spread_home
       from bse_shadow_signal s
       left join bse_shadow_grade gr on gr.signal_id = s.id
      where s.model_hash = $1
      order by s.season desc, s.week desc, s.signal_line_at desc
      limit $2`,
    [modelHash, limit],
  )
  return rows.map((r) => ({
    id: Number(r.id),
    season: r.season,
    week: r.week,
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    side: r.side,
    predictedEdge: Number(r.predicted_edge),
    signalSpreadHome: Number(r.signal_line_spread_home),
    signalPrice: r.signal_line_price != null ? Number(r.signal_line_price) : null,
    signalLineAt: new Date(r.signal_line_at).toISOString(),
    kickoffAt: r.kickoff_at ? new Date(r.kickoff_at).toISOString() : null,
    atsResult: r.ats_result,
    atsCoverMargin: r.ats_cover_margin != null ? Number(r.ats_cover_margin) : null,
    clvPoints: r.clv_points != null ? Number(r.clv_points) : null,
    finalPregameSpreadHome: r.final_pregame_spread_home != null ? Number(r.final_pregame_spread_home) : null,
  }))
}
