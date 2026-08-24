# Phase 4 — Feature Audit + Walk-Forward Experiment Design

**Status: analysis only. No model trained, no model selected, no picks generated.**

Reproduce with: `01-schema` → `02-backfill` → `03-reconstruct` → `05-audit.mjs`.
Machine-readable outputs: `audit-results.json` (empirical) and `evaluation-protocol.json` (frozen protocol). Scoring: `eval-protocol.mjs`.

Dataset: **6,719** leakage-safe rows, completed FBS-vs-FBS games, 2015–2023. `actual_margin = home_points − away_points`, mean **+3.80** (home-field), std **21.07**.

---

## 1. Feature Inventory

All features are pregame-safe by the Phase-3 leakage contract. `diff` = home − away. Availability is % of the 6,719 rows where the value is non-null.

| Feature (differential) | Family | Def | Source | Avail % | Pre-kickoff | Abs/Diff | Live BSE equivalent |
|---|---|---|---|---|---|---|---|
| market_implied_home_margin | market | −market_spread | CFBD `/lines` | 99.9 | Yes | diff-like | Live DraftKings spread (**not** consensus — see §2) |
| market_open_implied_home_margin | market | −spreadOpen | CFBD `/lines` | 11.9 | Yes | diff-like | DK opening spread (sparse) |
| elo_diff | elo | home−away pregame Elo | CFBD `/games` pregame Elo | 100 | Yes | diff | CFBD weekly Elo (reproducible) |
| talent_diff | talent | 247 composite | CFBD `/talent` | 100 | Yes | diff | CFBD talent (annual, preseason) |
| prior_sp_diff | prior ratings | prior-season SP+ | CFBD `/ratings/sp` (season−1) | 98.5 | Yes | diff | Prior-season SP+ |
| prior_srs_diff | prior ratings | prior-season SRS | CFBD `/ratings/srs` (season−1) | 93.4 | Yes | diff | Prior-season SRS |
| prior_fpi_diff | prior ratings | prior-season FPI | CFBD `/ratings/fpi` (season−1) | 98.4 | Yes | diff | Prior-season FPI |
| recruiting_points_diff | recruiting | class points | CFBD `/recruiting/teams` | 99.8 | Yes | diff | Recruiting points |
| returning_ppa_diff | returning prod | returning PPA | CFBD `/player/returning` | 98.6 | Yes | diff | Returning production |
| returning_percent_diff | returning prod | % PPA returning | CFBD `/player/returning` | 98.6 | Yes | diff | Returning production |
| form_net_ppa_diff | adv efficiency | as-of (offPPA−defPPA) | CFBD `/stats/game/advanced` | 93.2 | Yes | diff | Rebuilt weekly from played games |
| form_net_success_diff | adv efficiency | as-of net success rate | CFBD advanced | 93.2 | Yes | diff | Rebuilt weekly |
| form_net_explo_diff | adv efficiency | as-of net explosiveness | CFBD advanced | 93.2 | Yes | diff | Rebuilt weekly |
| form_ppa_overall_diff | adv efficiency | as-of net overall PPA | CFBD `/ppa/games` | 93.2 | Yes | diff | Rebuilt weekly |
| form_scoring_margin_diff | scoring | as-of avg margin | CFBD `/games` | 93.3 | Yes | diff | Rebuilt weekly |
| form_points_for_diff | scoring | as-of avg PF | CFBD `/games` | 93.3 | Yes | diff | Rebuilt weekly |
| form_points_against_diff | scoring | as-of avg PA | CFBD `/games` | 93.3 | Yes | diff | Rebuilt weekly |
| rest_diff | rest/schedule | days since last game | derived from schedule | 93.3 | Yes | diff | Derivable from schedule |
| games_played_diff | rest/schedule | as-of games played | derived from schedule | 100 | Yes | diff | Derivable from schedule |
| (missingness indicators) | missingness | per-feature null flags | derived in-fold | n/a | Yes | flag | Recreated live identically |

**Historical-only (cannot be reproduced live in 2026):** none of the *features* are historical-only — every one is rebuildable from CFBD live. The one thing that is **not** reproducible is the *composition of the historical market line itself* (mostly consensus), covered next.

---

## 2. Train/Serve Parity Matrix

| Feature/family | Classification | Reason |
|---|---|---|
| elo_diff, games_played_diff | **PARITY_SAFE** | CFBD supplies identically live; 100% coverage. |
| talent_diff, recruiting_*_diff, returning_*_diff | **PARITY_SAFE** | Annual preseason values, same endpoints live. |
| prior_sp/srs/fpi_diff | **PARITY_SAFE** | Prior-season finals; fully known before 2026 season. |
| form_* (advanced/ppa/scoring) | **PARITY_SAFE** | Rebuilt from played games via the same as-of logic live. |
| rest_diff | **PARITY_SAFE** | Schedule-derived. |
| **market_implied_home_margin** | **PARITY_IMPERFECT** | Historical is **86% consensus / 10.8% DraftKings**; live BSE prices off **DraftKings only**. Same concept, different distribution — do **not** treat as identical. |
| market_open_implied_home_margin | **PARITY_IMPERFECT + sparse** | Only 11.9% historical coverage; live DK opener differs from historical consensus opener. |
| CFBD `spread` as "closing line" | **HISTORICAL_ONLY (as a *close*)** | CFBD stores a last-recorded value with no timestamp; a true verified close does not exist historically and should not be claimed. |
| Live real-time injuries / availability | **LIVE_ONLY** | Not present historically at all; if BSE uses it live it cannot be validated on this dataset. |
| Live multi-book line shopping / true consensus | **LIVE_ONLY** | Not reconstructable historically. |

**Critical parity note:** the market baseline below is computed on a mostly-consensus historical line. BSE competes live against DraftKings. Consensus and DK differ by small but bet-relevant amounts, so a residual edge learned against consensus may shrink or vanish against DK. This is the single biggest external validity risk in the whole program.

---

## 3. Market Baseline (the benchmark BSE must beat)

Orientation **validated by assertion** in `05-audit.mjs`: `corr(market_implied_home_margin, actual_margin) = 0.661`, straight-up accuracy **74.2%** (n=6,711). Both gates (corr>0.5, SU>60%) passed.

- **Overall: MAE 12.46, RMSE 15.81, bias +0.27** (market is essentially unbiased on margin).
- Per-season MAE is remarkably stable **12.03–13.06** across all nine seasons (2020 included at 12.89).
- ATS vs the market itself is ~50% by construction; the real target is out-of-sample MAE improvement **and** clearing the −110 breakeven ATS rate (**52.38%**) on selected bets.

This is a hard baseline. Beating 12.46 MAE out-of-sample by even a few tenths of a point, stably, is a genuine result.

---

## 4. Feature-Family Signal (correlation with actual_margin)

| Feature | corr | early(≤wk4) | late(≥wk9) | season-corr std | Note |
|---|---|---|---|---|---|
| market_implied_home_margin | 0.661 | 0.695 | 0.650 | 0.026 | Strongest, most stable. |
| elo_diff | 0.606 | 0.613 | 0.617 | 0.028 | Best non-market signal; stable all year. |
| prior_fpi_diff | 0.514 | 0.605 | 0.446 | 0.016 | Prior ratings fade late. |
| prior_sp_diff | 0.508 | 0.593 | 0.450 | 0.022 | " |
| prior_srs_diff | 0.501 | 0.593 | 0.437 | 0.027 | " |
| form_scoring_margin_diff | 0.476 | 0.367 | 0.583 | 0.037 | Form **rises** late. |
| form_net_ppa_diff | 0.456 | 0.347 | 0.559 | 0.036 | " |
| form_ppa_overall_diff | 0.456 | 0.347 | 0.559 | 0.036 | Duplicate of net_ppa (r≈1.0). |
| form_net_success_diff | 0.441 | 0.332 | 0.549 | 0.026 | " |
| recruiting_points_diff | 0.418 | 0.528 | 0.331 | 0.054 | Talent proxy; fades late. |
| talent_diff | 0.405 | 0.517 | 0.318 | 0.049 | " |
| form_points_for/against_diff | 0.37 / −0.39 | — | — | 0.037 | Signed as expected. |
| returning_ppa_diff | 0.348 | 0.335 | 0.348 | 0.046 | Modest, steady. |
| returning_percent_diff | 0.129 | — | — | 0.072 | Weak/unstable. |
| **form_net_explo_diff** | **0.024** | 0.02 | 0.014 | 0.069 | **No signal — drop.** |
| **rest_diff** | **0.001** | −0.034 | −0.01 | 0.045 | **No signal — drop.** |
| **games_played_diff** | **−0.044** | — | — | 0.055 | **No signal — drop.** |

**Clear temporal structure:** prior-season ratings & talent lead **early**; in-season efficiency/scoring form leads **late**. This motivates a season-progress interaction or games-played weighting of form. All retained signals are stable across seasons (std ≤ ~0.05); none is a single-season artifact.

**Collinearity (drop/regularize):** `prior_sp ≈ prior_fpi` (0.96); `form_net_ppa ≈ form_ppa_overall` (1.00, exact duplicate); `form_net_ppa ≈ form_scoring_margin` (0.92); `talent ≈ recruiting` (0.83); `elo ≈ market` (0.91 — so for the market-independent model, Elo already carries most of the market's information without leaking the line).

---

## 5. Walk-Forward Design (frozen)

Expanding window, **no random splits**. All preprocessing/imputation/scaling/selection fit **inside each training fold only**.

| Fold | Train | Train rows (excl 2020) | Test | Test rows |
|---|---|---|---|---|
| 1 | 2015–2018 | 3,073 (3,073) | 2019 | 774 |
| 2 | 2015–2019 | 3,847 (3,847) | **2020** | 534 · **anomalous** |
| 3 | 2015–2020 | 4,381 (3,847) | 2021 | 770 |
| 4 | 2015–2021 | 5,151 (4,617) | 2022 | 776 |
| 5 | 2015–2022 | 5,927 (5,393) | 2023 | 792 |

**2020 treatment:** kept and flagged (`is_anomalous_season`, 534 rows). Report every aggregate **both including and excluding 2020**; present fold 2 (test = 2020) as a separate stress test, never as headline performance. Default recommendation: exclude/down-weight 2020 in training-fold fitting.

---

## 6. BSE Objective + Locked Metrics

BSE's goal is not raw score prediction — it is finding where BSE's margin differs from the market. Locked metrics (see `evaluation-protocol.json`, scored by `eval-protocol.mjs`):

- **Margin:** MAE, RMSE, bias.
- **Market comparison:** modelMae vs marketMae, `maeImprovement`, `predicted_edge = predicted_home_margin − market_implied_home_margin`.
- **Bet selection** at absolute edge thresholds **{1,2,3,4,5,7}**: qualifying games, ATS W/L/push, win% (pushes excluded), units at −110, per season. ATS cover rule: HOME covers iff `actual_margin > market_implied_home_margin`. **Thresholds are fixed a priori and never tuned on the season being evaluated.** Breakeven at −110 = **52.38%**.

The scorer was self-tested on real 2023 data: market-as-predictor → 0 qualifying bets at every threshold; perfect predictor → 100% ATS; market MAE reproduces 12.18.

---

## 7. Two Model Families (both to be tested; no assumption of a winner)

- **A — Independent fair line:** predict `actual_margin` **without** the market as input. For this family, do **not** feed the market line; Elo already carries ~0.91 of it. Gives BSE's unanchored opinion.
- **B — Market-aware residual:** predict `market_error = actual_margin − market_implied_home_margin`; final prediction = market + predicted residual. Tests for systematic mispricing. **Caveat:** residual learned against 86%-consensus history may not transfer to live DraftKings — validate parity before trusting B live.

---

## 8. Candidate Model Set (frozen — no model shopping)

1. **Ridge linear** — stable baseline; L2 handles the heavy collinearity without discarding correlated real signal; interpretable.
2. **ElasticNet** — adds L1 for light pruning among redundant families.
3. **Gradient-boosted trees** (shallow, early-stopped on an inner train split) — captures the early/late and talent×form interactions.
4. **Market-anchored ridge (family B)** — simplest honest test of residual mispricing signal.

Hyperparameters tuned only on earlier/inner folds, never the evaluated test season. A candidate "beats the market" only if it improves MAE **and** clears 52.38% ATS out-of-sample with temporal stability.

---

## 9. Missing-Data Strategy

- Median-impute **within the training fold** + an explicit missingness indicator per imputed feature; never use test-fold statistics.
- **Season openers** (~6.7% of sides) have null form by design — impute + flag, and add a `first_game_of_season` indicator so the model can down-weight absent form.
- Prior ratings 93–98% (newcomers/reclassifiers) — impute + flag. Elo is 100% and the most reliable single power input.

---

## 10. Problems Discovered in Phase 3

1. **Market parity gap (most important):** historical line is 86% consensus, only 10.8% DraftKings; BSE serves DK live. `PARITY_IMPERFECT`, not identical.
2. **No true closing line historically** — CFBD `spread` is a last-recorded value with no timestamp; do not call it a close.
3. **`division=fbs` was ignored by CFBD v2** during backfill (param renamed to `classification`); handled by filtering both-FBS via stored classification — raw tables intentionally still hold all divisions as opponents' context.
4. **Duplicate annual keys** (e.g. talent listing a team twice) — fixed with last-wins dedupe in the upsert.
5. **Exact-duplicate feature:** `form_net_ppa_diff` and `form_ppa_overall_diff` correlate r≈1.00 — keep only one.
6. **Dead features:** explosiveness diff, rest diff, games-played diff carry ~0 linear signal on margin.

---

## Stop Condition

Feature inventory, parity matrix, market baseline, family signal, folds, missing-data + 2020 strategy, independent-vs-residual plan, frozen candidate set, and locked metrics are all delivered and saved. **No model was trained or selected and no picks were generated. Awaiting review before Phase 5.**
