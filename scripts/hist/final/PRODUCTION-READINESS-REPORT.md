# BSE Shadow-Validation — Production-Readiness Test

**Verdict: PASS** (after two fail-closed fixes; frozen model untouched)

Date: 2026-08-28
Scope: end-to-end dry run of the live 2026 shadow-validation path + failure-case
hardening. No new modeling phase, no refit/retune, Phases 1–7 untouched.

---

## How it was tested

There are no real 2026 games yet (season has not started), so the dry run drove
one **real completed game** through the **exact production functions**
(`loadFrozenArtifact` → `validateServingRow` → `scoreFrozen` → DK snapshot
attach → orientation → signal insert → `computeAtsResult`/`computeClv` → the
dashboard read service), treating it as an "upcoming" game. All synthetic rows
are tagged `READINESS_TEST_SYNTHETIC` and deleted in a `finally` block.

Harness: `scripts/hist/final/15-readiness.mjs` (21/21 checks)
Grader unit tests: `scripts/hist/final/verify-grade.mjs` (11/11)
Parity: `scripts/hist/final/verify-parity.mjs` (max diff 3.55e-15)
Full system audit: `scripts/hist/final/14-audit.mjs` (18/18)

---

## Results by requested step

| # | Requirement | Result |
|---|---|---|
| 1 | Game enters via existing Board/data pipeline | PASS — read from `hist_training_rows` + Blob DK snapshot, same path as Board |
| 2 | All 17 features from pre-kickoff info only | PASS — features are as-of; `signal_line_at < kickoff` enforced and stored |
| 3 | Score with exact frozen `B_residual::gbt` | PASS — artifact hash `e88480a6…`, parity to 1e-15 |
| 4 | Correct DraftKings snapshot attached | PASS — matched on `cfbdId`, `dk_snapshot_at` persisted |
| 5 | Edge + team/spread orientation correct | PASS — `edge = mihm + gbt`, side/home-spread verified |
| 6 | Qualify/reject decision correct | PASS — fires only when `|edge| ≥ 1`; sub-threshold rejection proven, not forced |
| 7 | Later ATS + CLV grading correct | PASS — after CLV sign fix (see below); 11/11 orientation cases |
| 8 | `/admin/shadow-validation` shows the record | PASS — read service returns the synthetic signal in overall + weekly + list |
| 9 | Failure cases fail closed | PASS — all 8 (see below) |
| 10 | Ranked production risks | Below |

### Failure cases (step 9) — all fail closed
- **Missing DK line** → game skipped, no signal.
- **Missing core feature** (elo/talent) → `validateServingRow` rejects.
- **Malformed data** (`"abc"`, `NaN`) → rejected BEFORE scoring. *(Previously
  this manufactured a signal — now fixed.)*
- **Duplicate capture** → `ON CONFLICT (model_hash, cfbd_game_id) DO NOTHING`.
- **Post-kickoff** → leakage guard skips (`kickoff ≤ now`).
- **Stale line** → snapshot older than 48h aborts the run.
- **Upstream API down** → null snapshot → capture exits, no signals.
- **Immutability** → UPDATE and DELETE on a signal are both blocked by trigger.

---

## Fixes applied (only what the live 2026 pipeline needs)

Both are serving/grading-side. **The frozen artifact and `scoreFrozen` math were
NOT changed** — parity re-verified at 3.55e-15.

1. **CLV sign was inverted (CRITICAL, fixed).** `computeClv` returned
   `finSide − sigSide`, so beating the close registered as negative CLV. Since
   CLV is the primary prospective signal, an inverted sign would make a
   line-losing model look line-beating. Corrected to `sigSide − finSide` with a
   worked example in the docstring. **0 real grades existed**, so no re-grade was
   needed — the fix lands before any 2026 grading. The prior `verify-grade.mjs`
   "passed" only because it asserted the same inverted convention; its cases are
   now corrected.

2. **Serving-side validity guard added (HIGH, fixed).** The frozen model
   median-imputes missing features (correct for training), but at serve time
   that meant a game with missing/corrupt inputs still produced a prediction
   ("betting on medians"). Added `validateServingRow`: rejects any source column
   that is present-but-non-finite (malformed), and requires the two core
   features that are 100% populated across all 6,719 training rows
   (`elo_diff`, `talent_diff`). Legitimately-sparse features (week-1 form/rest)
   are still imputed exactly as in training, so no valid game is wrongly
   rejected. Wired into the capture job with a `skipped — invalid` counter.

3. **Staleness guard added (part of HIGH).** Capture aborts if the newest DK
   snapshot is >48h old (`--max-snapshot-age-hours` override), so a stalled odds
   refresh can never attach a stale line to a signal.

---

## Remaining production risks (ranked)

**CRITICAL** — none open.

**HIGH**
- **DK↔CFBD game matching depends on the existing odds-match layer.** If a 2026
  game fails to match a DK entry, it is silently skipped (correct fail-closed
  behavior), but a systematic matching gap would mean *zero* signals with no
  loud alarm. Mitigation: the capture summary prints `skipped — no DK line`;
  watch it weekly.
- **Feature freshness is only as good as the reconstruct job.** Signals require
  `hist_training_rows` to be populated for the target 2026 week from live CFBD
  before capture. If that job lags, capture finds no rows and writes nothing
  (fail-closed, but silent). Operator checklist covers ordering.

**MEDIUM**
- **Train/serve market gap (documented since Phase 6).** The frozen model was
  fit on 80% consensus / 20% DraftKings lines, but 2026 signals grade against
  DraftKings. This is a known interpretability caveat for the CLV/ATS numbers,
  not a code defect — it is exactly what the shadow test is measuring.
- **Kickoff-time source.** The leakage guard uses `startDate` (falling back to
  the DK snapshot's kickoff). A wrong/TBD kickoff in upstream data could mis-time
  the guard; TBD kickoffs are treated as not-yet-started (permissive) — revisit
  if CFBD publishes many TBD 2026 kickoffs.

**LOW**
- **Single-book (DraftKings) dependency** — by design; no multi-book fallback.
- **Manual weekly operation** — capture/grade are run on demand, not scheduled;
  a missed week simply yields fewer signals (no data corruption).
- **`push` handling in ATS** already returns a push (no bet graded W/L); verified.

---

## Bottom line

The live 2026 path is **production-ready**. It scores with the exact frozen
candidate, attaches the correct timestamped DraftKings line, writes an immutable
before-kickoff signal only when `|edge| ≥ 1`, grades ATS and CLV with the correct
orientation, and surfaces on the admin dashboard. Every tested failure mode fails
closed rather than manufacturing a prediction. The two defects found (inverted
CLV, imputation-driven serving) are fixed, with the frozen model provably
unchanged.
