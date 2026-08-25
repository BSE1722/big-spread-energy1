# Phase 7 — Market-Failure & Selectivity Discovery

**Discovery only. No model deployed, no picks generated, no Phase 1–6 artifact modified.**
Reproduce with `node scripts/hist/phase7/08-discover.mjs` → `phase7-results.json`.
Regimes were frozen in `regimes-config.json` **before** any ATS number was computed.

## Inputs (all frozen, leakage-safe)
- `hist_phase5_predictions` — frozen Phase 5 walk-forward OOS predictions (21,864 rows, 6 model×family combos, **3,644 distinct OOS games**, test seasons 2019–2023).
- `hist_training_rows` — leakage-safe as-of pregame features + label.
- `hist_raw_games` — home/away conference (concentration tests only).

No new data. No future information. Postgame fields used only as outcomes.

## Sign-convention assertions (all PASS, printed before scoring)
- Perfect-hindsight grader = 100%; anti-hindsight = 0%.
- Always-bet-home ATS = **49.8%** (market ≈ efficient, as expected).
- `market_implied_home_margin == -market_spread` on a 500-row sample.
- Elo-disagreement≥6 orientation sanity = 47.8% (not inverted; not a result).

## 1. Hypotheses tested
**74 pre-registered regime instances** (10 families × thresholds; `model_edge` applied to all 6 frozen combos). **62 eligible** at the pre-set minimum of ≥100 decided bets (excl-2020). Each instance counts as one hypothesis in the correction.

## 2. Top 10 raw performers (excl-2020, decided ≥100)
| Regime | T | ATS% | W–L (n) | Wilson95 | ROI | seas>50 | rawP |
|---|--:|--:|---|---|--:|--:|--:|
| model_edge[B_residual::gbt] | 2 | 56.9 | 161–122 (283) | [51.1, 62.5] | +8.6% | 5/5 | 0.024 |
| model_edge[B_residual::market_anchored_ridge] | 3 | 56.4 | 97–75 (172) | [48.9, 63.6] | +7.7% | 4/5 | 0.109 |
| **model_edge[B_residual::gbt]** | **1** | **55.8** | **491–389 (880)** | **[52.5, 59.0]** | **+6.5%** | **5/5** | **0.001** |
| model_edge[B_residual::elasticnet] | 1 | 54.1 | 271–230 (501) | [49.7, 58.4] | +3.3% | 4/4 | 0.074 |
| model_edge[B_residual::market_anchored_ridge] | 2 | 54.1 | 313–266 (579) | [50.0, 58.1] | +3.2% | 5/5 | 0.056 |
| model_edge[B_residual::market_anchored_ridge] | 1 | 53.6 | 838–724 (1562) | [51.2, 56.1] | +2.4% | 5/5 | 0.004 |
| back_large_favorites | 17 | 52.1 | 367–337 (704) | [48.4, 55.8] | −0.5% | 3/5 | 0.274 |
| back_large_favorites | 14 | 52.0 | 502–463 (965) | [48.9, 55.2] | −0.7% | 3/5 | 0.221 |
| back_large_favorites | 21 | 51.3 | 233–221 (454) | [46.7, 55.9] | −2.0% | 3/5 | 0.606 |
| model_edge[A_independent::ridge] | 3 | 51.2 | 822–784 (1606) | [48.7, 53.6] | −2.3% | 5/5 | 0.356 |

Every strong performer is a frozen **Phase 5 residual model**. Every *new* Phase 7 regime family sits at chance.

## 3. Corrected significance (mandatory)
- Raw-significant (p<0.05): **5** of 62.
- **Bonferroni** (α/cell = 0.001): **0 of 62 survive.**
- **Benjamini–Hochberg FDR (q=0.10)**: **1 of 62 survives** — `model_edge[B_residual::gbt] T=1` (p=0.001, exactly at the BH cutoff).

A single BH discovery sitting *on* the cutoff, with 0 surviving family-wise control, is fragile evidence.

## 4. Best selective / abstention results
The edge-threshold sweep **is** the abstention analysis (higher T = stronger evidence required = fewer bets). Only the residual models show the desired "fewer bets → stronger signal" shape:
- `B_residual::gbt`: T=1 → 55.8% (n=880); T=2 → 56.9% (n=283). Improves, but sample collapses and T≥3 falls below the 100-bet floor (cannot be verified).
- Every REJECTED family stays ~48–52% regardless of how selective you get — tightening produces **no** signal, which is the honest null result.

## 5. Season-by-season stability
`B_residual::gbt` T=1 is >50% in **5/5** non-2020 seasons — its one genuinely reassuring property. The contextual/feature regimes are split ~2–3 of 5 (coin-flip).

## 6. Neighborhood robustness
- `B_residual::gbt`: only **two** adequate-sample points (T=1: 55.8, T=2: 56.9). Trend is upward but too short to call stable.
- `B_residual::market_anchored_ridge`: T=1 53.6 → T=2 54.1 → T=3 56.4 (rising, monotone), but T=1 Wilson-low (51.2) is **below** breakeven.
- No fade/disagreement family has a stable above-50 neighborhood.

## 7. Team / conference concentration
For the survivors, the effect is **not** concentration-driven:
- `B_residual::gbt` T=1: base 55.8% → remove best team (UTSA) 55.4% → remove best conf (SEC) 55.4%.
- `B_residual::market_anchored_ridge` T=1: 53.6% → 53.4% (−Coastal Carolina) → 52.8% (−AAC).

Robustness to concentration is the residual edge's second reassuring property — but it does not rescue the failed significance.

## 8. Multiple-comparison bottom line
Of 62 hypotheses: 0 survive Bonferroni; 1 survives BH-FDR at the boundary. The lone survivor is **not a newly discovered regime** — it is the same residual-GBT model edge Phase 5 already surfaced and already rated PROMISING_BUT_UNPROVEN.

## 9. Does any regime qualify as STRONG_CANDIDATE?
**No.** STRONG_CANDIDATE requires surviving walk-forward + neighborhood + concentration + multiple-comparison correction *and* clearing the profitability bar. The best regime (`B_residual::gbt` T=1) survives seasons and concentration and clears the BH-FDR bar with a Wilson-low of 52.5% > 52.38% — but it **fails family-wise (Bonferroni) control**, has only a two-point verifiable neighborhood, and is a re-confirmation of a known Phase 5 result rather than a new market-failure regime. It is classified **PROMISING_BUT_UNPROVEN**. Everything else is **REJECTED**.

## 10. Verdict — is a Phase 8 confirmation justified?

**No deployable market-failure regime found.**

Phase 7's actual objective — finding *pre-definable situations where the market is systematically less efficient* — returned nothing: all fade/back-favorite, home/road-underdog, Elo/SP+/FPI/form-disagreement, and multi-family-consensus regimes are indistinguishable from chance after correction. The only surviving signal is the pre-existing Phase 5 residual model, marginal and family-wise-insignificant.

Forcing a Phase 8 historical-confirmation experiment is **not justified** — there is no new, corrected, generalizable edge to confirm, and re-testing the same residual model on the same historical universe would just relitigate Phase 5. The only defensible next step (unchanged from Phase 6) is **prospective**: log live DraftKings closing-line value for the residual-GBT selective signal going forward and let out-of-sample *future* data adjudicate it — not another retrospective phase.

**Stopped after the report. No deployment, no live picks, no production-model change.**
