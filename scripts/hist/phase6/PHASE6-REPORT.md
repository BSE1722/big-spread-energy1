# Phase 6 — Information-Gap Audit / Data-Expansion Feasibility

**Scope:** audit only. No backfill, no model, no picks. Phase 3–5 artifacts untouched.
**Verification budget used:** 13 external requests (CFBD 6, SGO 4, Open-Meteo 3) + several zero-cost DB inspections.
**Rerunnable probes:** `scripts/hist/phase6/_probe_db.mjs`, `_probe_ext.mjs`, `_probe_marketgap.mjs`. Machine-readable result: `parity-matrix.json`.

---

## Headline

The single addition that would actually matter — **timestamped historical DraftKings (or any verifiable closing) lines** — **does not exist** in any source available to this project. Everything else that is obtainable is either low-value, parity-imperfect, or (injuries) impossible to reconstruct leakage-safe.

And the gap is not academic. Using 2023 (the only season where CFBD stored DraftKings next to the proxies), the **best real-book proxy differs from DraftKings by 0.73 pts on the spread on average; consensus by 1.22 pts.** Phase 5's best "edge" was a sub-1% ATS bump that didn't survive multiple-comparison correction. **The proxy error is larger than any edge we could find** — so a proxy/consensus-trained model cannot be trusted to produce a DraftKings-specific edge.

---

## Priority-by-priority findings

### P1 — Betting-market history (the crux)
- **CFBD lines carry NO timestamp** (verified in stored raw jsonb: keys are `spread, spreadOpen, overUnder, overUnderOpen, moneylines, formattedSpread` — nothing temporal). Nothing here can be called a "closing line."
- **DraftKings in CFBD = 2023 only** (757 games). No DraftKings for 2015–2022.
- Real-book coverage by season: `consensus`/`teamrankings` 2015–2023 (but teamrankings/numberfire are **model predictions, not books**), **Caesars 2018–2020, Bovada 2019–2023, William Hill 2020–2023, ESPN Bet 2023**.
- **SGO (SportsGameOdds)** exposes DraftKings with `openBookOdds` + current `bookOdds` + per-book `lastUpdatedAt` — genuinely timestamped — **but only live/forward**: a 2019 window returned **0 events**, and the amateur tier caps at **2,500 entities/month**. SGO helps *serving*, never *training*.
- **Market gap quantified (vs DraftKings, 2023):** William Hill 0.73 pt / 31.9% exact; Bovada 1.04 pt / 26% exact; consensus 1.22 pt. Around key numbers 3 and 7 these differences flip covers.

### P2 — Player availability / injuries
- **CFBD `/injuries` → 404. No injury source exists here.** No historical, no live, no timestamps.
- Untimestamped retrospective injury lists are **rejected** — they leak the outcome. **RED.**

### P3 — Roster / player value
- CFBD `/roster`, `/player/usage`, `/player/returning`, `/stats/player/season`, `/recruiting` all return 200 and are usable for **preseason-static** measures (QB experience/usage, returning production, recruiting/talent, class/depth).
- Transfer portal endpoint exists but was **empty for 2019** (portal era ~2021+ — earliest depth needs verification).
- Everything is **season-level with no intra-season timestamps**; mid-season starter/QB changes can't be captured (no injury feed). **YELLOW.**

### P4 — Weather
- **Open-Meteo Archive (ERA5, actual observations)** works for 2015–2023 (deep to 1940). But actuals ≠ pre-kickoff forecast → mild forward bias (train on actuals, serve on forecast).
- **Open-Meteo Historical-Forecast (archived forecasts, time-safe)** returned data for both 2019 and 2023; pre-2021 depth **needs verification** (may silently fall back to reanalysis).
- Outdoor venues only (dome flag known). Value skews to totals/unders, weak on spread. **YELLOW.**

### P5 — Situational / schedule
- Fully derivable **from data already in hand** — 6,719/6,719 games have kickoff timestamps; 852 venues carry lat/lon/elevation/timezone/dome. Rest diff, consecutive road, travel distance, timezone change, altitude, neutral, conference, prev-game margin/OT, bye/short week, SOS-of-prior. Time-safe, perfect parity, **zero API cost. GREEN** — but Phase 4 already found rest/games-played ≈ 0 signal, so information value is **LOW**.

---

## Parity matrix (summary)

| Candidate | Parity | Earliest hist. | Timestamps | Info value | Cost |
|---|---|---|---|---|---|
| Situational/schedule | 🟢 GREEN | 2015 | kickoff ✓ | LOW | zero |
| Real-book market (WH/Bovada), 2019–23 | 🟡 YELLOW | 2018–2020 | none | MEDIUM | zero (stored) |
| Live DraftKings via SGO | 🟢 serve / 🔴 train | live only | ✓ (live) | HIGH (fwd) / ZERO (train) | entity-capped |
| Weather (hist-forecast/archive) | 🟡 YELLOW | 2015 (archive) | obs/forecast | LOW-MED | free |
| QB exp / returning starters | 🟡 YELLOW | 2014–15 | season-only | LOW-MED | moderate |
| Injuries / availability | 🔴 RED | none | none | high but UNOBTAINABLE | n/a |
| Timestamped DraftKings closing history | 🔴 RED | none | none | HIGHEST | needs paid vendor (absent) |

---

## Recommended additions, ranked by INFORMATION VALUE (not ease)

1. **Timestamped historical DraftKings closing lines — HIGHEST value, UNAVAILABLE.** Do not fabricate or approximate. This is the honest ceiling on the whole project.
2. **Forward CLV logging on live DraftKings (SGO).** Zero new model. Capture open+close+`lastUpdatedAt` each week so a real DraftKings edge can be measured *prospectively*. High product value; already wired.
3. **Re-base the market feature on real books, restricted to 2019–2023.** Zero API cost (stored). Shrinks proxy-vs-DK error from ~1.2 → ~0.7–1.0 pt. Improves realism, not signal.
4. **Weather via historical-forecast (outdoor only).** Net-new, free, but low expected spread value.
5. **QB experience / returning starters.** Net-new but season-static, moderate backfill, no injury updates.
6. **Situational/schedule.** Free and time-safe, but largely already tested as dead.

## Explicitly reject
Untimestamped retrospective injuries (leakage); CFBD `spread` as a "closing line" (no timestamp); any consensus-trained edge asserted as a DraftKings edge (proxy error > edge); SGO as a historical backfill; numberfire/teamrankings as "market."

---

## Exact proposed Phase 7 dataset (IF pursued despite the verdict)
- **Window:** 2019–2023 (real-book era; drop 2015–2018 where only consensus/model lines exist).
- **Label:** home margin (unchanged, matches Phase 5 control).
- **Market feature:** best available real book per game — William Hill → Bovada → Caesars → (flagged) consensus. Labelled "a line," never "the close."
- **New features (YELLOW, optional):** weather via historical-forecast (outdoor only); QB experience + returning starters (preseason-static); situational/schedule (free).
- **Frozen control:** must beat the frozen Phase 5 protocol out-of-sample under the identical walk-forward folds and multiple-comparison correction.
- **Hard acceptance gate:** any apparent edge MUST be validated forward on live DraftKings (via SGO CLV logging) before being trusted — because no historical DraftKings ground truth exists.

---

## Final answer

**Is there enough new, leakage-safe, train/serve-compatible information to justify Phase 7? — NO (qualified).**

The one addition that could plausibly change Phase 5's outcome — real, timestamped DraftKings/closing-line history — **is not obtainable**, and the injury dimension (the other high-value axis) **cannot be reconstructed leakage-safe**. What *is* available (situational, real-book proxy, weather, roster value) is either low-value, already-tested-dead, or parity-imperfect, and none of it addresses the measured **0.7–1.2-point proxy-vs-DraftKings gap that already exceeds any edge Phase 5 found**.

**Recommendation:** do **not** force another modeling experiment. Instead invest in *data and evaluation quality* that requires no new model: (a) re-base the market on real books over 2019–2023, and (b) stand up forward DraftKings CLV logging via SGO so a genuine edge can be proven prospectively. Only revisit Phase 7 if a timestamped historical DraftKings/closing-line source becomes available.

**Phase 5 remains the frozen baseline. Nothing in Phases 3–5 was modified.**
