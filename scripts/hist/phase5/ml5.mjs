// ---------------------------------------------------------------------------
// Dependency-free regression models for the Phase 5 tournament:
//   - ridge (closed form, L2)
//   - elastic net (coordinate descent, L1+L2)
//   - histogram gradient-boosted trees (shallow, squared error, early stopping)
// All operate on plain number[][] matrices. No training data is global; every
// fit receives only the arrays it is given by the walk-forward driver.
// ---------------------------------------------------------------------------

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length

// --- linear algebra: solve Ax=b (Gaussian elimination, partial pivot) ------
function solve(A, b) {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    ;[M[col], M[piv]] = [M[piv], M[col]]
    const d = M[col][col]
    if (Math.abs(d) < 1e-12) continue
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / d
      if (f === 0) continue
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const d = M[i][i]
    x[i] = Math.abs(d) < 1e-12 ? 0 : M[i][n] / d
  }
  return x
}

// --- Ridge: (X'X + lambda I) w = X'yc ; intercept = mean(y) ----------------
// X is expected standardized (mean~0); intercept not penalized.
export function ridgeFit(X, y, lambda) {
  const n = X.length
  const p = X[0].length
  const my = mean(y)
  const yc = y.map((v) => v - my)
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0))
  const Xty = new Array(p).fill(0)
  for (let i = 0; i < n; i++) {
    const xi = X[i]
    for (let a = 0; a < p; a++) {
      Xty[a] += xi[a] * yc[i]
      for (let b = a; b < p; b++) XtX[a][b] += xi[a] * xi[b]
    }
  }
  for (let a = 0; a < p; a++) {
    for (let b = a; b < p; b++) XtX[b][a] = XtX[a][b]
    XtX[a][a] += lambda
  }
  const w = solve(XtX, Xty)
  return { w, intercept: my }
}

export function linearPredict(model, X) {
  return X.map((xi) => {
    let s = model.intercept
    for (let j = 0; j < xi.length; j++) s += model.w[j] * xi[j]
    return s
  })
}

// --- Elastic net: glmnet-style coordinate descent on standardized X --------
// minimize (1/2n)||yc - Xw||^2 + lambda*(l1*||w||_1 + (1-l1)/2*||w||_2^2)
export function elasticNetFit(X, y, lambda, l1ratio, iters = 200, tol = 1e-5) {
  const n = X.length
  const p = X[0].length
  const my = mean(y)
  const yc = y.map((v) => v - my)
  // column sum of squares / n (≈1 for standardized cols, but computed exactly)
  const colNorm = new Array(p).fill(0)
  for (let j = 0; j < p; j++) {
    let s = 0
    for (let i = 0; i < n; i++) s += X[i][j] * X[i][j]
    colNorm[j] = s / n || 1
  }
  const w = new Array(p).fill(0)
  const resid = yc.slice() // r = yc - Xw, starts at yc
  const a1 = lambda * l1ratio
  const a2 = lambda * (1 - l1ratio)
  const soft = (z, g) => (z > g ? z - g : z < -g ? z + g : 0)
  for (let it = 0; it < iters; it++) {
    let maxChange = 0
    for (let j = 0; j < p; j++) {
      let dot = 0
      for (let i = 0; i < n; i++) dot += X[i][j] * resid[i]
      const zj = w[j] * colNorm[j] + dot / n
      const wjNew = soft(zj, a1) / (colNorm[j] + a2)
      const delta = wjNew - w[j]
      if (delta !== 0) {
        for (let i = 0; i < n; i++) resid[i] -= X[i][j] * delta
        w[j] = wjNew
        if (Math.abs(delta) > maxChange) maxChange = Math.abs(delta)
      }
    }
    if (maxChange < tol) break
  }
  return { w, intercept: my }
}

// --- Histogram gradient-boosted trees (squared error) ----------------------
// Pre-bin each column into quantile bins on TRAIN, then grow shallow trees on
// residuals. Early stopping on a provided internal-validation set.
function quantileBins(col, maxBins) {
  const s = col.slice().sort((a, b) => a - b)
  const uniq = [...new Set(s)]
  if (uniq.length <= maxBins) {
    // edges between consecutive unique values
    const edges = []
    for (let i = 1; i < uniq.length; i++) edges.push((uniq[i - 1] + uniq[i]) / 2)
    return edges
  }
  const edges = []
  for (let b = 1; b < maxBins; b++) {
    const q = s[Math.floor((b / maxBins) * (s.length - 1))]
    edges.push(q)
  }
  // dedupe monotonic
  return [...new Set(edges)]
}
function binValue(v, edges) {
  // returns bin index 0..edges.length
  let lo = 0
  let hi = edges.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (v <= edges[mid]) hi = mid
    else lo = mid + 1
  }
  return lo
}
function binMatrix(X, edgesPerCol) {
  const n = X.length
  const p = X[0].length
  const B = Array.from({ length: n }, () => new Int16Array(p))
  for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) B[i][j] = binValue(X[i][j], edgesPerCol[j])
  return B
}

function growTree(binned, grad, indices, depth, minLeaf, nBinsPerCol) {
  const p = nBinsPerCol.length
  function build(idx, d) {
    // leaf value = mean gradient
    let g = 0
    for (const i of idx) g += grad[i]
    const leafVal = idx.length ? g / idx.length : 0
    if (d >= depth || idx.length < 2 * minLeaf) return { leaf: true, value: leafVal }
    let best = null
    for (let j = 0; j < p; j++) {
      const nb = nBinsPerCol[j]
      if (nb < 2) continue
      const sumG = new Float64Array(nb)
      const cnt = new Int32Array(nb)
      for (const i of idx) {
        const b = binned[i][j]
        sumG[b] += grad[i]
        cnt[b] += 1
      }
      let totG = 0
      let totC = 0
      for (let b = 0; b < nb; b++) {
        totG += sumG[b]
        totC += cnt[b]
      }
      let leftG = 0
      let leftC = 0
      const parent = (totG * totG) / totC
      for (let b = 0; b < nb - 1; b++) {
        leftG += sumG[b]
        leftC += cnt[b]
        const rightC = totC - leftC
        if (leftC < minLeaf || rightC < minLeaf) continue
        const rightG = totG - leftG
        const gain = (leftG * leftG) / leftC + (rightG * rightG) / rightC - parent
        if (!best || gain > best.gain) best = { gain, feature: j, binThresh: b }
      }
    }
    if (!best || best.gain <= 1e-9) return { leaf: true, value: leafVal }
    const L = []
    const R = []
    for (const i of idx) (binned[i][best.feature] <= best.binThresh ? L : R).push(i)
    if (L.length < minLeaf || R.length < minLeaf) return { leaf: true, value: leafVal }
    return { leaf: false, feature: best.feature, binThresh: best.binThresh, left: build(L, d + 1), right: build(R, d + 1) }
  }
  return build(indices, 0)
}
function predictTreeBinned(node, brow) {
  let n = node
  while (!n.leaf) n = brow[n.feature] <= n.binThresh ? n.left : n.right
  return n.value
}

/**
 * Fit GBT. Xtrain/ytrain fit the trees; Xval/yval drive early stopping.
 * opts: { depth, learningRate, maxTrees, minLeaf, maxBins, patience }
 */
export function gbtFit(Xtrain, ytrain, Xval, yval, opts) {
  const { depth = 3, learningRate = 0.05, maxTrees = 300, minLeaf = 20, maxBins = 64, patience = 20 } = opts
  const p = Xtrain[0].length
  const edgesPerCol = []
  for (let j = 0; j < p; j++) edgesPerCol.push(quantileBins(Xtrain.map((r) => r[j]), maxBins))
  const nBinsPerCol = edgesPerCol.map((e) => e.length + 1)
  const Btr = binMatrix(Xtrain, edgesPerCol)
  const Bva = Xval && Xval.length ? binMatrix(Xval, edgesPerCol) : null
  const base = mean(ytrain)
  const predTr = new Float64Array(Xtrain.length).fill(base)
  const predVa = Bva ? new Float64Array(Xval.length).fill(base) : null
  const idxAll = Array.from({ length: Xtrain.length }, (_, i) => i)
  const trees = []
  let bestValMae = Infinity
  let bestN = 0
  let sinceBest = 0
  const grad = new Float64Array(Xtrain.length)
  for (let t = 0; t < maxTrees; t++) {
    for (let i = 0; i < Xtrain.length; i++) grad[i] = ytrain[i] - predTr[i]
    const tree = growTree(Btr, grad, idxAll, depth, minLeaf, nBinsPerCol)
    trees.push(tree)
    for (let i = 0; i < Xtrain.length; i++) predTr[i] += learningRate * predictTreeBinned(tree, Btr[i])
    if (Bva) {
      let mae = 0
      for (let i = 0; i < Xval.length; i++) {
        predVa[i] += learningRate * predictTreeBinned(tree, Bva[i])
        mae += Math.abs(yval[i] - predVa[i])
      }
      mae /= Xval.length
      if (mae < bestValMae - 1e-6) {
        bestValMae = mae
        bestN = t + 1
        sinceBest = 0
      } else if (++sinceBest >= patience) {
        break
      }
    }
  }
  if (!Bva) bestN = trees.length
  return { base, learningRate, edgesPerCol, trees: trees.slice(0, bestN || trees.length), bestValMae, nTrees: bestN || trees.length }
}

export function gbtPredict(model, X) {
  const B = binMatrix(X, model.edgesPerCol)
  return B.map((brow) => {
    let s = model.base
    for (const tree of model.trees) s += model.learningRate * predictTreeBinned(tree, brow)
    return s
  })
}
