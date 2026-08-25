// ---------------------------------------------------------------------------
// Small, dependency-free statistics helpers for the Phase 4 audit.
// Pearson correlation, error metrics, quantiles. Pairwise-complete: every
// function drops null/NaN pairs so missingness never silently biases a result.
// ---------------------------------------------------------------------------

const finite = (x) => typeof x === "number" && Number.isFinite(x)

/** Pearson r over pairwise-complete (x,y). Returns {r, n}. */
export function pearson(xs, ys) {
  const px = []
  const py = []
  for (let i = 0; i < xs.length; i++) {
    if (finite(xs[i]) && finite(ys[i])) {
      px.push(xs[i])
      py.push(ys[i])
    }
  }
  const n = px.length
  if (n < 3) return { r: null, n }
  const mx = px.reduce((a, b) => a + b, 0) / n
  const my = py.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = px[i] - mx
    const dy = py[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return { r: null, n }
  return { r: sxy / Math.sqrt(sxx * syy), n }
}

/** Error metrics for predictions vs actuals (pairwise-complete). */
export function errorMetrics(preds, actuals) {
  const e = []
  for (let i = 0; i < preds.length; i++) {
    if (finite(preds[i]) && finite(actuals[i])) e.push(preds[i] - actuals[i])
  }
  const n = e.length
  if (n === 0) return { n: 0, mae: null, rmse: null, bias: null }
  const mae = e.reduce((a, b) => a + Math.abs(b), 0) / n
  const rmse = Math.sqrt(e.reduce((a, b) => a + b * b, 0) / n)
  const bias = e.reduce((a, b) => a + b, 0) / n
  return { n, mae, rmse, bias }
}

export function mean(xs) {
  const v = xs.filter(finite)
  if (v.length === 0) return null
  return v.reduce((a, b) => a + b, 0) / v.length
}

export function std(xs) {
  const v = xs.filter(finite)
  if (v.length < 2) return null
  const m = v.reduce((a, b) => a + b, 0) / v.length
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1))
}

export function r2(n, dp = 3) {
  if (!finite(n)) return null
  const f = 10 ** dp
  return Math.round(n * f) / f
}

export function pct(n, d) {
  if (!d) return 0
  return r2((100 * n) / d, 1)
}
