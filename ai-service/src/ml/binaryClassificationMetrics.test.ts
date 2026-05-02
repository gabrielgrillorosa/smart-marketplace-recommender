import { describe, it, expect } from 'vitest'
import {
  aucRocMannWhitney,
  aucPrAveragePrecision,
  brierScore,
  accuracyAtThreshold,
} from './binaryClassificationMetrics.js'

describe('binaryClassificationMetrics', () => {
  it('computes perfect AUC-ROC when positives score higher', () => {
    const labels = [0, 0, 1, 1]
    const probs = [0.1, 0.2, 0.8, 0.9]
    const auc = aucRocMannWhitney(labels, probs)
    expect(auc).toBeCloseTo(1, 5)
  })

  it('returns null when only one class', () => {
    expect(aucRocMannWhitney([0, 0], [0.2, 0.8])).toBeNull()
    expect(aucPrAveragePrecision([1, 1], [0.2, 0.8])).toBeNull()
  })

  it('computes Brier and accuracy', () => {
    const labels = [0, 1]
    const probs = [0, 1]
    expect(brierScore(labels, probs)).toBe(0)
    expect(accuracyAtThreshold(labels, probs, 0.5)).toBe(1)
  })
})
