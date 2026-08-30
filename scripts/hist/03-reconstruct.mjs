// ---------------------------------------------------------------------------
// Stage 3 — reconstruct leakage-safe, AS-OF pregame features into
// hist_training_rows. Reads ONLY hist_raw_* tables; never reads the training
// table back. Idempotent: fully recomputes and upserts each row.
//
// LEAKAGE CONTRACT (every feature for a target game G, kickoff = G.startDate):
//   * Team "form" (advanced/ppa/scoring) = average over that team's games in
//     the SAME season with startDate STRICTLY BEFORE G.startDate. Week-1 teams
//     therefore have null form — that is honest, not leakage.
//   * SP+/SRS/FPI = the team's PRIOR-season (season-1) end value only. Never
//     the current season (those are end-of-season and would leak).
//   * talent / recruiting / returning production = current-season values; these
//     are known preseason, so they are pregame-safe.
//   * Elo = homePregameElo / awayPregameElo from G itself (already pre-kickoff).
//   * rest_days / games_played_ytd = derived from the team's earlier same-season
//     schedule only.
//   * market_* = frozen CFBD line fields (opening + last-recorded). CFBD's
//     `spread`/`overUnder` are NOT a verified closing line and are labelled so.
//   * home_points/away_points/actual_margin = LABEL. Never fed as an input.
// ---------------------------------------------------------------------------

import { makePool } from "./lib.mjs"

const FEATURE_VERSION = "hist-v1"
const ANOMALOUS_SEASONS = new Set([2020]) // COVID-shortened; flagged, not dropped
const START = 2015 // talent (a core feature) binds here; matches backfill window
const END = 2023
// Preferred market provider order (matches the app's live book first).
const PROVIDER_PREFERENCE = ["DraftKings", "consensus", "teamrankings", "Caesars", "William Hill", "Bovada"]

// --- SERVE MODE ------------------------------------------------------------
// `--serve-season <year>` reconstructs ONE upcoming season and, unlike the
// training path, ALSO emits rows for NOT-YET-COMPLETED both-FBS games so the
// live capture job can score them pre-kickoff. This is leakage-safe: an unplayed
// game has no outcome to leak, so home_points/away_points/actual_margin are
// written null (LABEL only — never a model input). Every FEATURE is built with
// the identical AS-OF logic below (Week-1 openers have null form, imputed by the
// frozen recipe exactly as in training). Default behavior (no flag) is unchanged.
function serveArg() {
  const i = process.argv.indexOf("--serve-season")
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : null
}
const SERVE_SEASON = serveArg()

function avg(nums) {
  const v = nums.filter((n) => n != null && Number.isFinite(n))
  if (v.length === 0) return null
  return v.reduce((a, b) => a + b, 0) / v.length
}
function round(n, d = 4) {
  if (n == null || !Number.isFinite(n)) return null
  const f = 10 ** d
  return Math.round(n * f) / f
}

async function main() {
  const pool = makePool()
  const q = async (s, p = []) => (await pool.query(s, p)).rows
  let totalRows = 0

  try {
    const loopStart = SERVE_SEASON ?? START
    const loopEnd = SERVE_SEASON ?? END
    for (let season = loopStart; season <= loopEnd; season++) {
      // ---- Load everything for this season up-front (raw only) ------------
      const games = await q(
        `select "gameId", season, week, "seasonType", "startDate", completed,
                "neutralSite", "conferenceGame", "venueId",
                "homeTeam", "homeClassification", "homePoints",
                "awayTeam", "awayClassification", "awayPoints",
                "homePregameElo", "awayPregameElo"
           from hist_raw_games where season = $1 order by "startDate" nulls last, week`,
        [season],
      )

      // Per-team chronological schedule (ALL games, any opponent division),
      // each carrying that team's own-perspective per-game stats.
      const advRows = await q(`select "gameId", team, off_ppa, def_ppa, off_success_rate, def_success_rate, off_explosiveness, def_explosiveness from hist_raw_advanced where season=$1`, [season])
      const ppaRows = await q(`select "gameId", team, off_overall, def_overall from hist_raw_ppa where season=$1`, [season])
      const adv = new Map() // `${gameId}|${team}` -> row
      for (const r of advRows) adv.set(`${r.gameId}|${r.team}`, r)
      const ppa = new Map()
      for (const r of ppaRows) ppa.set(`${r.gameId}|${r.team}`, r)

      // Prior-season ratings (season - 1) as priors.
      const spPrev = new Map((await q(`select team, rating from hist_raw_sp where season=$1`, [season - 1])).map((r) => [r.team, r.rating]))
      const srsPrev = new Map((await q(`select team, rating from hist_raw_srs where season=$1`, [season - 1])).map((r) => [r.team, r.rating]))
      const fpiPrev = new Map((await q(`select team, fpi from hist_raw_fpi where season=$1`, [season - 1])).map((r) => [r.team, r.fpi]))

      // Preseason-safe current-season annual features.
      const talent = new Map((await q(`select team, talent from hist_raw_talent where season=$1`, [season])).map((r) => [r.team, r.talent]))
      const recruit = new Map((await q(`select team, rank, points from hist_raw_recruiting where season=$1`, [season])).map((r) => [r.team, r]))
      const returning = new Map((await q(`select team, total_ppa, percent_ppa from hist_raw_returning where season=$1`, [season])).map((r) => [r.team, r]))

      // Market lines grouped per game, best provider chosen by preference.
      const lineRows = await q(`select "gameId", provider, spread, "spreadOpen", "overUnder", "overUnderOpen", "homeMoneyline", "awayMoneyline" from hist_raw_lines where season=$1`, [season])
      const linesByGame = new Map()
      for (const r of lineRows) {
        if (!linesByGame.has(r.gameId)) linesByGame.set(r.gameId, [])
        linesByGame.get(r.gameId).push(r)
      }
      const pickLine = (gameId) => {
        const arr = linesByGame.get(gameId)
        if (!arr || arr.length === 0) return null
        for (const p of PROVIDER_PREFERENCE) {
          const hit = arr.find((x) => x.provider === p)
          if (hit) return hit
        }
        return arr[0]
      }

      // Build per-team ordered schedule with own-perspective per-game rows.
      const schedule = new Map() // team -> [{startDate, gameId, pf, pa, margin, off_ppa,...}]
      const pushGame = (team, entry) => {
        if (!schedule.has(team)) schedule.set(team, [])
        schedule.get(team).push(entry)
      }
      for (const g of games) {
        const t = g.startDate ? new Date(g.startDate).getTime() : null
        if (g.homeTeam) {
          const a = adv.get(`${g.gameId}|${g.homeTeam}`)
          const p = ppa.get(`${g.gameId}|${g.homeTeam}`)
          pushGame(g.homeTeam, {
            t, gameId: g.gameId,
            pf: g.homePoints, pa: g.awayPoints,
            margin: g.homePoints != null && g.awayPoints != null ? g.homePoints - g.awayPoints : null,
            off_ppa: a?.off_ppa, def_ppa: a?.def_ppa,
            off_success: a?.off_success_rate, def_success: a?.def_success_rate,
            off_explo: a?.off_explosiveness, def_explo: a?.def_explosiveness,
            ppa_off: p?.off_overall, ppa_def: p?.def_overall,
          })
        }
        if (g.awayTeam) {
          const a = adv.get(`${g.gameId}|${g.awayTeam}`)
          const p = ppa.get(`${g.gameId}|${g.awayTeam}`)
          pushGame(g.awayTeam, {
            t, gameId: g.gameId,
            pf: g.awayPoints, pa: g.homePoints,
            margin: g.awayPoints != null && g.homePoints != null ? g.awayPoints - g.homePoints : null,
            off_ppa: a?.off_ppa, def_ppa: a?.def_ppa,
            off_success: a?.off_success_rate, def_success: a?.def_success_rate,
            off_explo: a?.off_explosiveness, def_explo: a?.def_explosiveness,
            ppa_off: p?.off_overall, ppa_def: p?.def_overall,
          })
        }
      }
      for (const list of schedule.values()) list.sort((x, y) => (x.t ?? 0) - (y.t ?? 0))

      // As-of aggregate: that team's games STRICTLY before kickoff time `t`.
      const asOf = (team, t) => {
        const list = schedule.get(team) || []
        const prior = list.filter((e) => e.t != null && t != null && e.t < t)
        const lastPrior = prior.length ? prior[prior.length - 1] : null
        const restDays = lastPrior && t != null ? Math.round((t - lastPrior.t) / 86400000) : null
        return {
          gp: prior.length,
          rest: restDays,
          off_ppa: round(avg(prior.map((e) => e.off_ppa))),
          def_ppa: round(avg(prior.map((e) => e.def_ppa))),
          off_success: round(avg(prior.map((e) => e.off_success))),
          def_success: round(avg(prior.map((e) => e.def_success))),
          off_explo: round(avg(prior.map((e) => e.off_explo))),
          def_explo: round(avg(prior.map((e) => e.def_explo))),
          ppa_off: round(avg(prior.map((e) => e.ppa_off))),
          ppa_def: round(avg(prior.map((e) => e.ppa_def))),
          pf: round(avg(prior.map((e) => e.pf)), 2),
          pa: round(avg(prior.map((e) => e.pa)), 2),
          margin: round(avg(prior.map((e) => e.margin)), 2),
        }
      }

      // ---- Emit one row per both-FBS game ---------------------------------
      // Training path: completed games only (labels required). Serve path: ALSO
      // include not-yet-completed both-FBS games (labels null) so the capture
      // job can score them pre-kickoff.
      const targets = games.filter((g) => {
        const bothFbs = g.homeClassification === "fbs" && g.awayClassification === "fbs"
        if (!bothFbs) return false
        if (SERVE_SEASON) return true // upcoming OR completed
        return g.completed && g.homePoints != null && g.awayPoints != null
      })

      const cols = [
        "gameId","season","week","seasonType","startDate","is_anomalous_season","neutral_site","conference_game","both_fbs","homeTeam","awayTeam",
        "home_elo_pregame","home_talent","home_recruiting_points","home_recruiting_rank","home_returning_ppa","home_returning_percent","home_prior_sp","home_prior_srs","home_prior_fpi","home_games_played_ytd","home_rest_days","home_avg_off_ppa","home_avg_def_ppa","home_avg_off_success","home_avg_def_success","home_avg_off_explosiveness","home_avg_def_explosiveness","home_avg_ppa_off_overall","home_avg_ppa_def_overall","home_avg_points_for","home_avg_points_against","home_avg_margin",
        "away_elo_pregame","away_talent","away_recruiting_points","away_recruiting_rank","away_returning_ppa","away_returning_percent","away_prior_sp","away_prior_srs","away_prior_fpi","away_games_played_ytd","away_rest_days","away_avg_off_ppa","away_avg_def_ppa","away_avg_off_success","away_avg_def_success","away_avg_off_explosiveness","away_avg_def_explosiveness","away_avg_ppa_off_overall","away_avg_ppa_def_overall","away_avg_points_for","away_avg_points_against","away_avg_margin",
        "elo_diff","talent_diff",
        "market_provider","market_spread","market_spread_open","market_over_under","market_over_under_open","market_home_ml","market_away_ml","market_note",
        "home_points","away_points","actual_margin","feature_version",
      ]

      const values = []
      for (const g of targets) {
        const t = g.startDate ? new Date(g.startDate).getTime() : null
        const h = asOf(g.homeTeam, t)
        const a = asOf(g.awayTeam, t)
        const hr = recruit.get(g.homeTeam), ar = recruit.get(g.awayTeam)
        const hret = returning.get(g.homeTeam), aret = returning.get(g.awayTeam)
        const line = pickLine(g.gameId)
        const eloDiff = g.homePregameElo != null && g.awayPregameElo != null ? g.homePregameElo - g.awayPregameElo : null
        const hTal = talent.get(g.homeTeam) ?? null, aTal = talent.get(g.awayTeam) ?? null
        values.push([
          g.gameId, season, g.week, g.seasonType, g.startDate, ANOMALOUS_SEASONS.has(season), g.neutralSite, g.conferenceGame, true, g.homeTeam, g.awayTeam,
          g.homePregameElo, hTal, hr?.points ?? null, hr?.rank ?? null, hret?.total_ppa ?? null, hret?.percent_ppa ?? null, spPrev.get(g.homeTeam) ?? null, srsPrev.get(g.homeTeam) ?? null, fpiPrev.get(g.homeTeam) ?? null, h.gp, h.rest, h.off_ppa, h.def_ppa, h.off_success, h.def_success, h.off_explo, h.def_explo, h.ppa_off, h.ppa_def, h.pf, h.pa, h.margin,
          g.awayPregameElo, aTal, ar?.points ?? null, ar?.rank ?? null, aret?.total_ppa ?? null, aret?.percent_ppa ?? null, spPrev.get(g.awayTeam) ?? null, srsPrev.get(g.awayTeam) ?? null, fpiPrev.get(g.awayTeam) ?? null, a.gp, a.rest, a.off_ppa, a.def_ppa, a.off_success, a.def_success, a.off_explo, a.def_explo, a.ppa_off, a.ppa_def, a.pf, a.pa, a.margin,
          eloDiff, hTal != null && aTal != null ? round(hTal - aTal, 2) : null,
          line?.provider ?? null, line?.spread ?? null, line?.spreadOpen ?? null, line?.overUnder ?? null, line?.overUnderOpen ?? null, line?.homeMoneyline ?? null, line?.awayMoneyline ?? null,
          line ? `CFBD ${line.provider}; spread=last-recorded (NOT verified close), *_open=opening` : "no line available",
          // LABELS. Null for unplayed serve-mode games (never coerce null-null->0).
          g.homePoints ?? null, g.awayPoints ?? null,
          g.homePoints != null && g.awayPoints != null ? g.homePoints - g.awayPoints : null,
          FEATURE_VERSION,
        ])
      }

      // Chunked upsert. generated_at is omitted from the insert (DB DEFAULT
      // now() fills it); the conflict branch refreshes it explicitly.
      const update = cols.filter((c) => c !== "gameId").map((c) => `"${c}"=excluded."${c}"`).join(", ")
      const n = cols.length
      const chunk = 150
      for (let i = 0; i < values.length; i += chunk) {
        const slice = values.slice(i, i + chunk)
        const ph = slice
          .map((_, r) => `(${cols.map((__, c) => `$${r * n + c + 1}`).join(",")})`)
          .join(",")
        const flat = slice.flat()
        await pool.query(
          `insert into hist_training_rows (${cols.map((c) => `"${c}"`).join(",")})
             values ${ph}
           on conflict ("gameId") do update set ${update}, generated_at = now()`,
          flat,
        )
      }
      totalRows += values.length
      console.log(`  ${season}: ${values.length} training rows (from ${games.length} raw games)`)
    }

    console.log(`Reconstruction complete. ${totalRows} training rows, feature_version=${FEATURE_VERSION}.`)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error("RECONSTRUCT ERROR:", e.message)
  console.error(e.stack)
  process.exit(1)
})
