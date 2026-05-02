/**
 * Offline metrics for binary labels in {0,1} and predicted probabilities.
 * Used by neural architecture benchmark (no sklearn dependency).
 */

export interface BinaryClassificationMetrics {
  aucRoc: number | null
  aucPr: number | null
  brier: number
  accuracyAt05: number
  positiveRateTrue: number
  positiveRatePred: number
}

/** Mann–Whitney U / rank formulation, average ranks for ties. */
export function aucRocMannWhitney(labels: number[], probs: number[]): number | null {
  if (labels.length !== probs.length || labels.length === 0) return null
  const nPos = labels.reduce((a, y) => a + (y === 1 ? 1 : 0), 0)
  const nNeg = labels.length - nPos
  if (nPos === 0 || nNeg === 0) return null

  const pairs = labels.map((y, i) => ({ y, p: probs[i], i }))
  pairs.sort((a, b) => a.p - b.p)

  let rank = 1
  let sumPosRanks = 0
  let k = 0
  while (k < pairs.length) {
    let j = k
    while (j < pairs.length && pairs[j].p === pairs[k].p) j++
    const avgRank = (rank + (rank + (j - k) - 1)) / 2
    for (let t = k; t < j; t++) {
      if (pairs[t].y === 1) sumPosRanks += avgRank
    }
    rank += j - k
    k = j
  }

  return (sumPosRanks - (nPos * (nPos + 1)) / 2) / (nPos * nNeg)
}

/** Average precision (area under precision–recall curve). */
export function aucPrAveragePrecision(labels: number[], probs: number[]): number | null {
  if (labels.length !== probs.length || labels.length === 0) return null
  const nPos = labels.reduce((a, y) => a + (y === 1 ? 1 : 0), 0)
  const nNeg = labels.length - nPos
  if (nPos === 0 || nNeg === 0) return null

  const order = labels.map((_, i) => i).sort((i, j) => probs[j] - probs[i])
  let tp = 0
  let fp = 0
  let sumPrecision = 0
  for (const i of order) {
    if (labels[i] === 1) {
      tp++
      sumPrecision += tp / (tp + fp)
    } else {
      fp++
    }
  }
  return sumPrecision / nPos
}

export function brierScore(labels: number[], probs: number[]): number {
  let s = 0
  for (let i = 0; i < labels.length; i++) {
    const d = probs[i] - labels[i]
    s += d * d
  }
  return s / labels.length
}

export function accuracyAtThreshold(labels: number[], probs: number[], threshold: number): number {
  let correct = 0
  for (let i = 0; i < labels.length; i++) {
    const pred = probs[i] >= threshold ? 1 : 0
    if (pred === labels[i]) correct++
  }
  return correct / labels.length
}

export function summarizeBinaryMetrics(labels: number[], probs: number[]): BinaryClassificationMetrics {
  const positiveRateTrue = labels.reduce((a, y) => a + y, 0) / labels.length
  const positiveRatePred = probs.reduce((a, p) => a + (p >= 0.5 ? 1 : 0), 0) / probs.length

  return {
    aucRoc: aucRocMannWhitney(labels, probs),
    aucPr: aucPrAveragePrecision(labels, probs),
    brier: brierScore(labels, probs),
    accuracyAt05: accuracyAtThreshold(labels, probs, 0.5),
    positiveRateTrue,
    positiveRatePred,
  }
}
