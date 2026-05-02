/** M17 P1 — recency re-rank boost (0 = disabled). Invalid values fail startup (PRS-10). */
export function parseRecencyRerankWeight(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(
      `[ai-service] RECENCY_RERANK_WEIGHT must be a finite number >= 0 (got ${JSON.stringify(raw)}). Set to 0 to disable recency re-ranking.`
    )
  }
  return n
}

/** M17 P1 — number of distinct recent purchased products to use as anchor embeddings (1–10). */
export function parseRecencyAnchorCount(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 1
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1 || n > 10) {
    throw new Error(
      `[ai-service] RECENCY_ANCHOR_COUNT must be an integer from 1 to 10 (got ${JSON.stringify(raw)}).`
    )
  }
  return n
}
