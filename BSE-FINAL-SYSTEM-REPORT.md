# BSE — Final System Report

_Project closeout. This document is the operating manual and the record of what was built and why._

---

## 1. What BSE currently does

Big Spread Energy (BSE) is a college-football spread product with three surfaces:

- **The Board** (`/`) — public view of upcoming FBS games with the current DraftKings line, sourced from a saved odds snapshot (Blob storage) that is refreshed on demand from SportsGameOdds (SGO).
- **Official BSE Picks / Track Record** — admin-published, append-only graded picks with a public track record. Unchanged by this phase.
- **Admin Control Room** (`/admin`) — customers, subscriptions, payments, pick publishing/grading, and manual DraftKings odds refresh.

This phase added a fourth, **research-only** surface: **Shadow Validation** (`/admin/shadow-validation`) — see §6.

---

## 2. What the historical research established (Phases 1–7)

| Phase | Question | Result |
|-------|----------|--------|
| 3 | Build a leakage-safe historical dataset | 6,719 as-of feature rows, 2015–2023 FBS, validated |
| 4 | What is the market baseline / feature signal? | Market MAE ≈ 12.5; `elo_diff` strongest feature; frozen eval protocol |
| 5 | Can a model beat the market OOS? | **No.** Independent models worse than market; residual models at noise floor. Best candidate `B_residual::gbt` edge≥1 = **PROMISING_BUT_UNPROVEN**, not deployable |
| 6 | Can better pre-kickoff data be added? | **No high-value, leakage-safe, train/serve-compatible source available.** No timestamped historical DraftKings; injuries RED |
| 7 | Any market-failure regime in the frozen predictions? | **No.** 0/62 survive Bonferroni; 1 survives BH-FDR on the cutoff (the same Phase 5 candidate). No new edge |

**Bottom line:** historical research found no deployable edge. The single candidate worth *prospective* testing is `B_residual::gbt, edge ≥ 1`. This phase does not relitigate that — it sets up the machinery to test it live.

---

## 3. Frozen prospective candidate

- **Identity:** `B_residual::gbt`, threshold **edge ≥ 1** (points of predicted residual vs the market).
- **Model hash:** `e88480a64da2…` (full hash in `bse_frozen_candidate` and `scripts/hist/final/frozen-candidate.json`).
- **How it was produced:** there was no saved Phase 5 model (the tournament discarded every fitted model, keeping only predictions). Per operator decision, the candidate was **fit once** on all FBS rows **2015–2023 excluding 2020**, using the **exact** 17-feature set, the **exact** preprocessing (median-impute + missingness flags), and the **fold-5 hyperparameters** (`depth=3, learningRate=0.05, nTrees=52 FIXED`). No re-tuning, no search, no edge/feature shopping.
- **Artifact:** serialized GBT trees + preprocessing spec + feature list, hashed with a canonical serialization. **Immutable** — 2026 results never modify it.
- **Verified:** the frozen scorer reproduces a fresh refit to machine precision (`verify-parity.mjs`).

> **Family-B note:** the edge depends only on the 17 non-market features. The DraftKings line is used solely as the ATS/ CLV grading baseline and to pick the bet side — it is not a model input.

---

## 4. Live data sources

| Source | Used for | How | Cost posture |
|--------|----------|-----|--------------|
| **SGO → DraftKings** | Board lines + shadow signalLine/finalPregameLine | Existing Blob snapshot via `loadSnapshot()` | Reused; **no new polling** added by this phase |
| **CFBD** | Final scores + in-season feature reconstruction | Existing historical pipeline (`scripts/hist/02/03`) | Only during a live 2026 season, run by the operator |

The shadow jobs make **zero direct external calls** — capture reads the Blob snapshot the Board already maintains; grading reads the database only. (Verified in the audit, §8.)

---

## 5. Shadow-validation workflow

1. **Capture** (`12-capture-signals.mjs`) — for each eligible 2026 FBS game with a live DraftKings line and reconstructed features, score the frozen model. When `|edge| ≥ 1`, write an **immutable** `bse_shadow_signal` (side, edge, DK line at signal time, price, book, timestamps, full feature snapshot, model hash). Refuses to write once kickoff has passed. Dedup on `(model_hash, cfbd_game_id)`. Also records a `bse_dk_snapshot` row for tracked games.
2. **Snapshot accrual** — every capture run also preserves the current DraftKings line for tracked games (from the same Blob snapshot), flagged `is_pre_kickoff`, so a **finalPregameLine** exists at grade time.
3. **Grade** (`13-grade.mjs`) — after finals, grade each signal **ATS at signalLine** and compute **CLV vs the last pre-kickoff DraftKings line**, writing to the separate `bse_shadow_grade` table. Signals are never touched.

**Terminology:** `signalLine` = DraftKings line at signal time. `finalPregameLine` = last DraftKings line captured strictly before kickoff. Neither is claimed to be a universal opener/closer.

---

## 6. Where results can be viewed

- **`/admin/shadow-validation`** — admin-gated (same `getAdmin()` DB-role check as `/admin`; 404 to everyone else). Linked from the Control Room under **Research**.
- Shows the frozen candidate identity, and **2026 prospective results**: signals, ATS W-L-P, ATS %, ROI (flat −110), avg/median CLV, % positive CLV — overall and **by week**, plus a per-signal log.
- The page is labeled, unmissably, **SHADOW VALIDATION — NOT DEPLOYED**, and states these are not Official BSE Picks.

---

## 7. Recurring external API usage / cost introduced

**Effectively zero incremental cost.** This phase added:
- **No new SGO polling** — reuses the Board's existing DraftKings snapshot.
- **No new AI/model API calls** — the frozen model is plain arithmetic over serialized trees, run locally.
- **CFBD** usage is only the existing in-season reconstruction the operator already runs to populate features; the shadow jobs add none of their own.

The only new load is database reads/writes to three small tables. If the operator refreshes DraftKings more often during a slate to capture tighter pre-kickoff lines, that is existing Board functionality — not new polling created here.

---

## 8. Final system audit (all PASS)

`node scripts/hist/final/14-audit.mjs` → **18/18 PASS**, plus `verify-grade.mjs` **11/11** and `verify-parity.mjs`/`verify-pipeline.mjs` green:

- Board still serves (`/` → 200); DraftKings snapshot path unchanged.
- Phases 1–7 untouched (`hist_phase5_predictions` = 21,864 rows; `hist_training_rows` present).
- Candidate frozen: `B_residual::gbt`, threshold 1, 52 trees, 2020 excluded, hash reproducible.
- Signals immutable (UPDATE + DELETE blocked by trigger).
- Duplicate signals impossible (unique `(model_hash, cfbd_game_id)`).
- Future scoring cannot leak finals (no signal at/after kickoff; grade in a separate table).
- ATS and CLV orientation unit-tested (11 hand-computed cases).
- Jobs make no external/AI calls; capture reuses the Blob snapshot.

---

## 9. Operating commands

All run from the project root with env loaded:
`set -a && source /vercel/share/.env.project && set +a`

| Step | When | Command |
|------|------|---------|
| (one-time) create schema | already done | `node scripts/hist/final/11-schema.mjs` |
| (one-time) freeze candidate | already done | `node scripts/hist/final/10-freeze.mjs` |
| Capture signals | during 2026, before kickoffs | `node scripts/hist/final/12-capture-signals.mjs 2026` |
| Grade finals | after games complete | `node scripts/hist/final/13-grade.mjs 2026` |
| Re-run audit | anytime | `node scripts/hist/final/14-audit.mjs` |

> Capture requires the season's feature rows in `hist_training_rows` (produced by the existing `02-backfill`/`03-reconstruct` pipeline for the live season) and a current DraftKings snapshot (the Board's existing refresh).

---

## 10. Known limitations

- **The candidate is unproven.** Phase 5/7 rated it PROMISING_BUT_UNPROVEN; its historical ATS edge did not survive multiple-comparison correction. Shadow validation exists precisely to decide this prospectively. **Do not deploy it or publish its signals as picks.**
- **Train/serve market gap.** The model was trained on rows that were ~80% consensus / ~20% DraftKings (Phase 6 finding); it is now scored/graded against DraftKings. CLV is the honest yardstick here, not just ATS.
- **No historical DraftKings.** We cannot backtest against real DraftKings closing lines because that data does not exist historically (Phase 6). Prospective 2026 capture is the only path to DraftKings-specific ground truth.
- **finalPregameLine ≠ official close.** It is the last DraftKings line we captured before kickoff; its tightness depends on how close to kickoff the operator refreshed odds.
- **Sample size.** A single 2026 season yields a few hundred signals at most — enough to detect a large edge or a clear CLV signal, not to certify a marginal one.

---

## 11. Operator checklist — a normal CFB week

You do **not** need to touch the model, the freeze, or any code. During the 2026 season:

1. **Midweek / before kickoffs:** make sure the season's feature data is current (run the existing CFBD reconstruction for 2026), then run **capture**:
   `node scripts/hist/final/12-capture-signals.mjs 2026`
   Optionally refresh DraftKings odds close to kickoff (existing Board refresh) so `finalPregameLine` is tight.
2. **After the slate finishes:** run **grade**:
   `node scripts/hist/final/13-grade.mjs 2026`
3. **Review:** open **`/admin/shadow-validation`** and read the weekly ATS/ROI/CLV numbers.
4. **Do nothing else.** Do not publish shadow signals as picks. Do not retrain or adjust the candidate. Let evidence accumulate across the season; a deploy/no-deploy decision is a *future* call based on prospective ATS **and** CLV.

_End of report._
