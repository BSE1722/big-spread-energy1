// TEMP read-only probe: does CFBD have the inputs the frozen recipe needs to
// serve 2026 Week 1 UPCOMING games? Uses cfbdGet (counts against budget) but
// never writes to the DB or logs an ingest run. Deleted after use.
import { cfbdGet } from "./lib.mjs"

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : "n/a"
}

const out = {}

// 1) Upcoming Week 1 FBS games — the critical elo_diff dependency.
const games = await cfbdGet(`/games?year=2026&seasonType=regular&week=1&division=fbs`)
const withElo = games.filter((g) => g.homePregameElo != null && g.awayPregameElo != null)
const bothFbs = games.filter((g) => g.homeClassification === "fbs" && g.awayClassification === "fbs")
const bothFbsWithElo = bothFbs.filter((g) => g.homePregameElo != null && g.awayPregameElo != null)
out.games = {
  total: games.length,
  completed: games.filter((g) => g.completed).length,
  bothFbs: bothFbs.length,
  withPregameElo: `${withElo.length} (${pct(withElo.length, games.length)})`,
  bothFbsWithPregameElo: `${bothFbsWithElo.length} (${pct(bothFbsWithElo.length, bothFbs.length)})`,
}
out.gamesSample = games.slice(0, 3).map((g) => ({
  id: g.id, week: g.week, completed: g.completed,
  away: g.awayTeam, home: g.homeTeam,
  awayElo: g.awayPregameElo, homeElo: g.homePregameElo,
  start: g.startDate,
}))

// 2) 2026 talent — the second guard-required input.
const talent = await cfbdGet(`/talent?year=2026`)
out.talent2026 = { rows: talent.length, sample: talent.slice(0, 3) }

// 3) Prior-season priors (2025) — imputed if absent, but improve the estimate.
for (const [label, path] of [
  ["sp2025", `/ratings/sp?year=2025`],
  ["srs2025", `/ratings/srs?year=2025`],
  ["fpi2025", `/ratings/fpi?year=2025`],
  ["recruiting2026", `/recruiting/teams?year=2026`],
  ["returning2026", `/player/returning?year=2026`],
  ["lines2026w1", `/lines?year=2026&seasonType=regular&week=1`],
]) {
  try {
    const d = await cfbdGet(path)
    out[label] = { rows: Array.isArray(d) ? d.length : "n/a" }
  } catch (e) {
    out[label] = { error: e.message }
  }
}

console.log(JSON.stringify(out, null, 2))
