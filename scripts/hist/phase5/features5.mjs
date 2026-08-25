// ---------------------------------------------------------------------------
// Phase 5 feature construction. The DERIVED map below is COPIED VERBATIM from
// scripts/hist/05-audit.mjs so the model's feature definitions are provably
// identical to the frozen Phase-4 protocol. Do not edit these definitions.
//
// Preprocessing (median-impute + per-feature missingness flag + optional
// standardization) is ALWAYS fit on the training fold only, then applied to the
// test fold, per the frozen walkForwardRules.
// ---------------------------------------------------------------------------

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const diff = (a, b) => (num(a) != null && num(b) != null ? a - b : null)
const net = (off, def) => (num(off) != null && num(def) != null ? off - def : null)

// --- VERBATIM COPY from 05-audit.mjs DERIVED (feature freeze) --------------
export const DERIVED = {
  market_implied_home_margin: (r) => (num(r.market_spread) != null ? -r.market_spread : null),
  market_open_implied_home_margin: (r) => (num(r.market_spread_open) != null ? -r.market_spread_open : null),

  elo_diff: (r) => diff(r.home_elo_pregame, r.away_elo_pregame),
  talent_diff: (r) => diff(r.home_talent, r.away_talent),

  prior_sp_diff: (r) => diff(r.home_prior_sp, r.away_prior_sp),
  prior_srs_diff: (r) => diff(r.home_prior_srs, r.away_prior_srs),
  prior_fpi_diff: (r) => diff(r.home_prior_fpi, r.away_prior_fpi),

  recruiting_points_diff: (r) => diff(r.home_recruiting_points, r.away_recruiting_points),
  returning_ppa_diff: (r) => diff(r.home_returning_ppa, r.away_returning_ppa),
  returning_percent_diff: (r) => diff(r.home_returning_percent, r.away_returning_percent),

  form_net_ppa_diff: (r) => diff(net(r.home_avg_off_ppa, r.home_avg_def_ppa), net(r.away_avg_off_ppa, r.away_avg_def_ppa)),
  form_net_success_diff: (r) => diff(net(r.home_avg_off_success, r.home_avg_def_success), net(r.away_avg_off_success, r.away_avg_def_success)),
  form_net_explo_diff: (r) => diff(net(r.home_avg_off_explosiveness, r.home_avg_def_explosiveness), net(r.away_avg_off_explosiveness, r.away_avg_def_explosiveness)),
  form_ppa_overall_diff: (r) => diff(net(r.home_avg_ppa_off_overall, r.home_avg_ppa_def_overall), net(r.away_avg_ppa_off_overall, r.away_avg_ppa_def_overall)),
  form_scoring_margin_diff: (r) => diff(r.home_avg_margin, r.away_avg_margin),
  form_points_for_diff: (r) => diff(r.home_avg_points_for, r.away_avg_points_for),
  form_points_against_diff: (r) => diff(r.home_avg_points_against, r.away_avg_points_against),

  rest_diff: (r) => diff(r.home_rest_days, r.away_rest_days),
  games_played_diff: (r) => diff(r.home_games_played_ytd, r.away_games_played_ytd),
}

// Market-implied home margin (needed by every family for scoring + family B target).
export const marketImplied = (r) => DERIVED.market_implied_home_margin(r)

// Model input features. FROZEN a priori (before seeing any Phase-5 result):
// every derived non-market differential + a neutral-site indicator. Weak
// features (explosiveness, rest, games_played) are intentionally kept and left
// to L2/L1 regularization rather than being dropped post-hoc, which would be a
// results-driven choice. The market is NEVER in this list (Family A must be
// market-independent; Family B uses it only as an additive anchor).
export const MODEL_FEATURES = [
  "elo_diff",
  "talent_diff",
  "prior_sp_diff",
  "prior_srs_diff",
  "prior_fpi_diff",
  "recruiting_points_diff",
  "returning_ppa_diff",
  "returning_percent_diff",
  "form_net_ppa_diff",
  "form_net_success_diff",
  "form_net_explo_diff",
  "form_ppa_overall_diff",
  "form_scoring_margin_diff",
  "form_points_for_diff",
  "form_points_against_diff",
  "rest_diff",
  "games_played_diff",
]

/** Raw derived feature value for a row (null if not computable). */
function rawFeat(row, name) {
  if (name === "neutral_site") return row.neutral_site ? 1 : 0
  const fn = DERIVED[name]
  return fn ? fn(row) : null
}

/**
 * Fit a preprocessing spec on TRAIN rows only:
 *  - median per feature (ignoring nulls)
 *  - which features get a missingness indicator (any null in train)
 *  - post-imputation mean/std for standardization (linear models)
 * `neutral_site` is always included as a non-imputed 0/1 context feature.
 */
export function fitPreprocess(trainRows) {
  const base = [...MODEL_FEATURES, "neutral_site"]
  const medians = {}
  const hasMiss = {}
  for (const f of base) {
    const vals = []
    let missing = 0
    for (const r of trainRows) {
      const v = rawFeat(r, f)
      if (v == null) missing++
      else vals.push(v)
    }
    vals.sort((a, b) => a - b)
    medians[f] = vals.length ? vals[Math.floor((vals.length - 1) / 2)] : 0
    hasMiss[f] = f !== "neutral_site" && missing > 0
  }
  // Column order: base features, then missingness flags for those with any missing.
  const missFlags = base.filter((f) => hasMiss[f]).map((f) => `${f}__miss`)
  const columns = [...base, ...missFlags]

  // Standardization stats computed on imputed TRAIN design.
  const trainX = trainRows.map((r) => designRow(r, base, missFlags, medians))
  const mean = new Array(columns.length).fill(0)
  const stdv = new Array(columns.length).fill(1)
  for (let j = 0; j < columns.length; j++) {
    let s = 0
    for (const x of trainX) s += x[j]
    const m = s / trainX.length
    let v = 0
    for (const x of trainX) v += (x[j] - m) ** 2
    const sd = Math.sqrt(v / Math.max(1, trainX.length - 1))
    mean[j] = m
    stdv[j] = sd > 1e-9 ? sd : 1
  }
  return { base, missFlags, medians, columns, mean, stdv }
}

/** Build one imputed design-row (raw scale) given a fitted spec. */
function designRow(row, base, missFlags, medians) {
  const out = []
  for (const f of base) {
    const v = rawFeat(row, f)
    out.push(v == null ? medians[f] : v)
  }
  for (const mf of missFlags) {
    const f = mf.slice(0, -6) // strip "__miss"
    out.push(rawFeat(row, f) == null ? 1 : 0)
  }
  return out
}

/** Raw (imputed) design matrix — for tree models (scale-invariant). */
export function transformRaw(rows, spec) {
  return rows.map((r) => designRow(r, spec.base, spec.missFlags, spec.medians))
}

/** Standardized design matrix — for linear models. */
export function transformStd(rows, spec) {
  const raw = transformRaw(rows, spec)
  return raw.map((x) => x.map((v, j) => (v - spec.mean[j]) / spec.stdv[j]))
}
