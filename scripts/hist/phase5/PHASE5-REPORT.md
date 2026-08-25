# Phase 5 — Walk-Forward Modeling Tournament (Report)

**Verdict: `NO_RELIABLE_EDGE` at the STRONG bar → classified `PROMISING_BUT_UNPROVEN`.**
No model demonstrated a statistically defensible ability to beat the closing/consensus market
against the spread. **No pick is recommended, and nothing here should be wired into production.**

All numbers below are out-of-sample (walk-forward), pooled over the four non-2020 test seasons
(2020 reported separately as a stress fold). Reproduce with:

```
node scripts/hist/phase5/06-tournament.mjs   # fits models, persists OOS predictions
node scripts/hist/phase5/07-score.mjs        # scoring, diagnostics, classification
```

Artifacts: `phase5-results.json` (full machine-readable results), `hist_phase5_predictions`
(every OOS prediction, 21,864 rows). Freeze verified against Phase 4 before any fitting
(protocol + scorer SHA-256 recorded in the tournament log).

---

## 1. What was tested (frozen before results were read)
- **Walk-forward, expanding window:** train on all seasons strictly before the test season;
  test on the held-out season. Test seasons: 2019, 2020(stress), 2021, 2022, 2023.
- **Two model families:**
  - **A — independent:** predict home margin from features only, *market excluded*.
  - **B — residual:** predict the market's residual (actual − market implied), then add back the
    market line. Market-anchored by construction.
- **Four model types** per family: ridge, elastic net, shallow histogram-GBT, and a
  market-anchored ridge (Family B only, replacing the redundant independent-ridge slot).
- **Preprocessing fit on training folds only:** median imputation + missingness flags,
  standardization for linear models. No test-fold information ever touched the fit.
- **Frozen scoring:** MAE / RMSE / bias vs market; edge-threshold ATS at {1,2,3,4,5,7} points;
  52.38% breakeven at −110; Wilson CIs; ROI at flat −110.

## 2. Accuracy vs the market (pooled, excl 2020)

| Candidate | MAE | Market MAE | ΔMAE (excl 2020) | Bias |
|---|---|---|---|---|
| B_residual::elasticnet | 12.315 | 12.326 | **+0.018** | 0.055 |
| B_residual::gbt | 12.316 | 12.326 | +0.007 | 0.060 |
| B_residual::market_anchored_ridge | 12.343 | 12.326 | −0.001 | 0.145 |
| A_independent::ridge | 12.890 | 12.326 | −0.559 | 0.612 |
| A_independent::elasticnet | 12.918 | 12.326 | −0.608 | 0.434 |
| A_independent::gbt | 12.958 | 12.326 | −0.657 | 0.580 |

- **Family A never beats the market** — every independent model is 0.56–0.66 points *worse* in
  MAE. The "fair line" it produces correlates **0.92+** with the market line (mean absolute
  disagreement ~4 pts), i.e. it is an inferior reconstruction of the same line, not new signal.
- **Family B sits on the noise floor** — the best improvement is **+0.018 MAE**, far too small to
  be meaningful. The models cannot predict the market's residual.

## 3. Against-the-spread results (the bar that actually matters)
The single most appealing cell was **B_residual::market_anchored_ridge**:

| Threshold | Bets (decided) | Win% | Wilson 95% | ROI% | Seasons > BE |
|---|---|---|---|---|---|
| 1 | 1562 | 53.6 | [51.2, 56.1] | +2.4 | 3/4 |
| 2 | 579 | 54.1 | [50.0, 58.1] | +3.2 | 3/4 |
| 3 | 172 | 56.4 | [48.9, 63.6] | +7.7 | 3/4 |

Looks tempting in isolation — but it fails the pre-registered skepticism gates:

1. **Multiple comparisons.** 23 adequate-sample cells (decided ≥ 200) were evaluated. The
   family-wise (Bonferroni) correction gives α ≈ 0.002/cell, z ≈ 3.065. Under that corrected
   interval, **no cell's lower bound clears 52.38%.** The naive [51.2, 56.1] shrinks below
   breakeven once you account for how many cells were searched.
2. **No accuracy gain.** This same candidate has ΔMAE ≈ −0.001 (excl 2020). An ATS "edge" with
   zero improvement in point accuracy is almost certainly variance, not skill.
3. **Calibration doesn't hold up.** Predicted-edge buckets do not pay monotonically; higher-edge
   buckets are small-sample and noisy (e.g. thr4 collapses on tiny N). A real edge should pay
   *more* as predicted edge grows and survive on larger samples.

Family A ATS is ~49–51% everywhere — indistinguishable from a coin flip and below breakeven after vig.

## 4. Classification (rule fixed before results)
- **STRONG_EVIDENCE** required, for at least one frozen cell: ΔMAE > 0, **family-wise-corrected**
  Wilson lower bound > 52.38%, > breakeven in ≥ 3 of 4 non-2020 seasons, **and** non-collapsing
  edge calibration. → **Not met by any cell.**
- **PROMISING_BUT_UNPROVEN** (some adequate-sample cell has pooled point ATS > 52.38% but clears
  no strong gate). → **This is the result.**
- The lone reason it is not the flat `NO_RELIABLE_EDGE` bucket is that raw point estimates poke
  above breakeven; every one of them dies under correction.

## 5. Why this is the expected, honest outcome
Phase 4 already flagged that `elo_diff` alone carries ~0.91 of the market line and that the market
baseline (MAE ~12.3) is extremely stable. Beating a mature CFB spread out-of-sample with
box-score-derived features and no injuries, no line-movement, no true closing line, and an
86%-consensus / 10.8%-DraftKings market is a very high bar. The models confirm it: they can
*approximate* the market, not *beat* it.

## 6. Honest limitations (do not paper over)
- **Train/serve market gap persists.** Historical market is mostly consensus; the DraftKings-only
  diagnostic (n=728, excl 2020) shows the same story — best ΔMAE ≈ +0.01, ATS not defensibly above
  breakeven. Diagnostic only; it was **not** used to select anything.
- **No verifiable closing line** in the data — `market_spread` is a last-recorded value.
- **No injury / availability / line-movement features** — arguably the biggest missing signals.
- **2020** was excluded from the decision and shown as a stress fold; it does not change the verdict.
- **Sample thinning at high thresholds** — the eye-catching high-threshold win rates ride on
  small N and wide intervals; they are explicitly discounted, not featured.

## 7. Recommendation
- **Do not deploy any of these models as a betting signal.** There is no defensible edge.
- If pursued further, the productive directions are *data*, not *algorithms*: real closing lines,
  line-movement, and injury/availability. Swapping in fancier learners on the current feature set
  is very unlikely to help — Family A vs B already shows the ceiling is set by information, not
  model class.
- The BSE-v1.0 `modelVersion` slot in the track-record system should stay `manual-pre-model` until
  a model clears the STRONG bar under this same frozen protocol.
