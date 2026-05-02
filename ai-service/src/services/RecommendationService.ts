import * as tf from '@tensorflow/tfjs-node'
import { FastifyBaseLogger } from 'fastify'
import { ModelStore } from './ModelStore.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { Neo4jUnavailableError, ClientNotFoundError } from '../repositories/Neo4jRepository.js'
import {
  aggregateClientProfileEmbeddings,
  deltaDaysUtc,
  type ProfilePoolingMode,
} from '../profile/clientProfileAggregation.js'
import type {
  CatalogProductRow,
  EligibilityReasonCode,
  RankingConfig,
  RecommendationResult,
} from '../types/index.js'
import { MatchReason } from '../types/index.js'

export class ModelNotTrainedError extends Error {
  readonly statusCode = 503
  constructor() {
    super('Model not trained. Call POST /api/v1/model/train first.')
    this.name = 'ModelNotTrainedError'
  }
}

export { ClientNotFoundError } from '../repositories/Neo4jRepository.js'

export class ClientNoPurchaseHistoryError extends Error {
  readonly statusCode = 422
  constructor() {
    super('Client has no purchase history. Cannot compute profile vector.')
    this.name = 'ClientNoPurchaseHistoryError'
  }
}

/** M17 ADR-063 — full recommend / from-cart always returns ranking metadata with the list. */
export type RecommendEnvelope = {
  recommendations: RecommendationResult[]
  rankingConfig: RankingConfig
  reason?: string
}

const EMPTY_CATALOG_REASON = 'No new products available for this client in their country'

export type RecommendFromVectorOptions = {
  cartIds?: Set<string>
  /** When set, empty country catalog returns `{ recommendations: [], reason }` instead of `[]`. */
  emptyCatalogReason?: string
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/** M17 P1 — aggregate multi-anchor signal as max cosine (spec / design default). */
export function maxCosineToAnchors(candidateEmbedding: number[], anchors: number[][]): number {
  if (anchors.length === 0) return 0
  let max = cosine(candidateEmbedding, anchors[0])
  for (let k = 1; k < anchors.length; k++) {
    const c = cosine(candidateEmbedding, anchors[k])
    if (c > max) max = c
  }
  return max
}

export function meanPooling(embeddings: number[][]): number[] {
  if (embeddings.length === 0) throw new Error('meanPooling: empty embeddings')
  const entries = embeddings.map((e) => ({ embedding: e, deltaDays: 0 }))
  return aggregateClientProfileEmbeddings(entries, 'mean', 30)
}

export function computeFinalScore(
  neuralScore: number,
  semanticScore: number,
  neuralWeight: number,
  semanticWeight: number
): number {
  return neuralWeight * neuralScore + semanticWeight * semanticScore
}

function hasEmbedding(row: CatalogProductRow): boolean {
  return Boolean(row.embedding && row.embedding.length > 0)
}

function computeEligibility(
  row: CatalogProductRow,
  cartIds: Set<string>,
  lastPurchaseMap: Map<string, string | null>,
  windowDays: number,
  now: Date
): { eligible: boolean; reason: EligibilityReasonCode; suppressionUntil: string | null } {
  if (cartIds.has(row.id)) {
    return { eligible: false, reason: 'in_cart', suppressionUntil: null }
  }
  const lastIso = lastPurchaseMap.get(row.id) ?? null
  if (lastIso) {
    const last = new Date(lastIso)
    if (!Number.isNaN(last.getTime())) {
      const windowMs = windowDays * 86400000
      const age = now.getTime() - last.getTime()
      if (age >= 0 && age < windowMs) {
        const suppressionUntil = new Date(last.getTime() + windowMs).toISOString()
        return { eligible: false, reason: 'recently_purchased', suppressionUntil }
      }
    }
  }
  if (!hasEmbedding(row)) {
    return { eligible: false, reason: 'no_embedding', suppressionUntil: null }
  }
  return { eligible: true, reason: 'eligible', suppressionUntil: null }
}

type HybridScores = {
  finalScore: number
  neuralScore: number
  semanticScore: number
  matchReason: MatchReason
  recencySimilarity: number
  rankScore: number
}

function toRecommendationItem(
  row: CatalogProductRow,
  meta: { eligible: boolean; reason: EligibilityReasonCode; suppressionUntil: string | null },
  scores: HybridScores | null,
  exposeRecencyRankFields: boolean,
  rankingConfig: RankingConfig
): RecommendationResult {
  const item: RecommendationResult = {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    sku: row.sku,
    finalScore: scores?.finalScore ?? null,
    neuralScore: scores?.neuralScore ?? null,
    semanticScore: scores?.semanticScore ?? null,
    matchReason: scores?.matchReason ?? null,
    eligible: meta.eligible,
    eligibilityReason: meta.reason,
    suppressionUntil: meta.suppressionUntil,
  }
  if (scores) {
    item.hybridNeuralTerm = rankingConfig.neuralWeight * scores.neuralScore
    item.hybridSemanticTerm = rankingConfig.semanticWeight * scores.semanticScore
    item.recencyBoostTerm = rankingConfig.recencyRerankWeight * scores.recencySimilarity
  }
  if (exposeRecencyRankFields && scores) {
    item.recencySimilarity = scores.recencySimilarity
    item.rankScore = scores.rankScore
  }
  return item
}

export class RecommendationService {
  constructor(
    private readonly modelStore: ModelStore,
    private readonly repo: Neo4jRepository,
    private readonly neuralWeight: number,
    private readonly semanticWeight: number,
    private readonly recentPurchaseWindowDays: number,
    private readonly recencyRerankWeight: number,
    private readonly recencyAnchorCount: number,
    private readonly profilePoolingMode: ProfilePoolingMode,
    private readonly profilePoolingHalfLifeDays: number,
    private readonly logger?: FastifyBaseLogger
  ) {}

  private getRankingConfig(): RankingConfig {
    return {
      neuralWeight: this.neuralWeight,
      semanticWeight: this.semanticWeight,
      recencyRerankWeight: this.recencyRerankWeight,
      profilePoolingMode: this.profilePoolingMode,
      profilePoolingHalfLifeDays: this.profilePoolingHalfLifeDays,
    }
  }

  /**
   * M16 — eligibility metadata for all catalog rows in the client country (no neural pass, no model required).
   */
  async recommendEligibilityOnly(clientId: string, cartProductIds: string[] = []): Promise<RecommendationResult[]> {
    const client = await this.repo.getClientWithCountry(clientId)
    if (!client) throw new ClientNotFoundError()

    const cartIds = new Set(cartProductIds.map((id) => id.trim()).filter(Boolean))
    const now = new Date()
    const [catalogRows, lastPurchaseMap] = await Promise.all([
      this.repo.getProductsInCountryCatalog(client.country),
      this.repo.getConfirmedPurchaseLastDates(clientId),
    ])

    const rc = this.getRankingConfig()
    return catalogRows.map((row) => {
      const meta = computeEligibility(row, cartIds, lastPurchaseMap, this.recentPurchaseWindowDays, now)
      return toRecommendationItem(row, meta, null, false, rc)
    })
  }

  async recommend(clientId: string, limit: number): Promise<RecommendEnvelope> {
    const model = this.modelStore.getModel()
    if (!model) throw new ModelNotTrainedError()

    const client = await this.repo.getClientWithCountry(clientId)
    if (!client) throw new ClientNotFoundError()

    const pool = await this.repo.getClientProfilePoolForAggregation(clientId)
    if (pool.length === 0) throw new ClientNoPurchaseHistoryError()

    const now = new Date()
    const entries = pool.map((row) => ({
      embedding: row.embedding,
      deltaDays: deltaDaysUtc(now, row.lastPurchaseIso, this.logger),
    }))
    const clientProfileVector = aggregateClientProfileEmbeddings(
      entries,
      this.profilePoolingMode,
      this.profilePoolingHalfLifeDays,
      this.logger
    )

    return this.recommendFromVector(clientId, limit, clientProfileVector, {
      emptyCatalogReason: EMPTY_CATALOG_REASON,
    })
  }

  async recommendFromCart(
    clientId: string,
    productIds: string[],
    limit: number
  ): Promise<RecommendEnvelope> {
    const uniqueCartProductIds = Array.from(
      new Set(productIds.map((id) => id.trim()).filter((id) => id.length > 0))
    )

    if (uniqueCartProductIds.length === 0) {
      return this.recommend(clientId, limit)
    }

    const model = this.modelStore.getModel()
    if (!model) throw new ModelNotTrainedError()

    const client = await this.repo.getClientWithCountry(clientId)
    if (!client) throw new ClientNotFoundError()

    const now = new Date()
    const pool = await this.repo.getClientProfilePoolForAggregation(clientId)

    const cartEmbeddings = await Promise.all(
      uniqueCartProductIds.map((id) => this.repo.getProductEmbedding(id))
    )

    const byProduct = new Map<string, { embedding: number[]; deltaDays: number }>()
    for (const row of pool) {
      byProduct.set(row.productId, {
        embedding: row.embedding,
        deltaDays: deltaDaysUtc(now, row.lastPurchaseIso, this.logger),
      })
    }
    for (let i = 0; i < uniqueCartProductIds.length; i++) {
      const emb = cartEmbeddings[i]
      if (emb && emb.length > 0) {
        byProduct.set(uniqueCartProductIds[i], { embedding: emb, deltaDays: 0 })
      }
    }

    const merged = [...byProduct.values()]
    if (merged.length === 0) throw new ClientNoPurchaseHistoryError()

    const clientProfileVector = aggregateClientProfileEmbeddings(
      merged.map((m) => ({ embedding: m.embedding, deltaDays: m.deltaDays })),
      this.profilePoolingMode,
      this.profilePoolingHalfLifeDays,
      this.logger
    )

    return this.recommendFromVector(clientId, limit, clientProfileVector, {
      cartIds: new Set(uniqueCartProductIds),
      emptyCatalogReason: EMPTY_CATALOG_REASON,
    })
  }

  async recommendFromVector(
    clientId: string,
    limit: number,
    profileVector: number[],
    options?: RecommendFromVectorOptions
  ): Promise<RecommendEnvelope> {
    const model = this.modelStore.getModel()
    if (!model) throw new ModelNotTrainedError()

    const client = await this.repo.getClientWithCountry(clientId)
    if (!client) throw new ClientNotFoundError()

    const now = new Date()
    const cartIds = options?.cartIds ?? new Set<string>()
    const emptyCatalogReason = options?.emptyCatalogReason

    const anchorPromise =
      this.recencyRerankWeight > 0
        ? this.repo.getRecentConfirmedPurchaseAnchorEmbeddings(clientId, this.recencyAnchorCount)
        : Promise.resolve<number[][]>([])

    const [catalogRows, lastPurchaseMap, anchorEmbeddings] = await Promise.all([
      this.repo.getProductsInCountryCatalog(client.country),
      this.repo.getConfirmedPurchaseLastDates(clientId),
      anchorPromise,
    ])

    const rankingConfig = this.getRankingConfig()

    if (catalogRows.length === 0) {
      if (emptyCatalogReason) {
        this.logger?.info({ clientId, reason: 'empty_catalog' })
        return { recommendations: [], reason: emptyCatalogReason, rankingConfig }
      }
      return { recommendations: [], rankingConfig }
    }

    const metas = catalogRows.map((row) => ({
      row,
      meta: computeEligibility(row, cartIds, lastPurchaseMap, this.recentPurchaseWindowDays, now),
    }))

    const scorable = metas.filter((m) => m.meta.eligible && hasEmbedding(m.row))

    if (scorable.length === 0) {
      const ineligibleOnly = metas
        .filter((m) => !m.meta.eligible)
        .map((m) => toRecommendationItem(m.row, m.meta, null, false, rankingConfig))
        .sort((a, b) => a.name.localeCompare(b.name))
      if (emptyCatalogReason) {
        this.logger?.info({ clientId, reason: 'no_eligible_candidates', ineligibleCount: ineligibleOnly.length })
      }
      return { recommendations: ineligibleOnly, rankingConfig }
    }

    const cappedLimit = Math.min(limit, 50)
    const exposeRecency = this.recencyRerankWeight > 0

    const neuralScoresList = tf.tidy(() => {
      const batchMatrix = tf.tensor2d(
        scorable.map((s) => [...(s.row.embedding as number[]), ...profileVector]),
        [scorable.length, 768]
      )
      const outputTensor = model.predict(batchMatrix) as tf.Tensor
      return Array.from(outputTensor.dataSync() as Float32Array)
    })

    const wr = this.recencyRerankWeight
    const anchors = anchorEmbeddings

    const scored = scorable.map((s, i) => {
      const neuralScore = neuralScoresList[i]
      const semanticScore = cosine(profileVector, s.row.embedding as number[])
      const finalScore = computeFinalScore(neuralScore, semanticScore, this.neuralWeight, this.semanticWeight)
      const diff = Math.abs(neuralScore - semanticScore)
      let matchReason: MatchReason
      if (diff < 0.05) {
        matchReason = 'hybrid'
      } else if (neuralScore > semanticScore) {
        matchReason = 'neural'
      } else {
        matchReason = 'semantic'
      }
      const recencySimilarity =
        wr > 0 && anchors.length > 0 ? maxCosineToAnchors(s.row.embedding as number[], anchors) : 0
      const rankScore = finalScore + wr * recencySimilarity
      return { row: s.row, meta: s.meta, scores: { finalScore, neuralScore, semanticScore, matchReason, recencySimilarity, rankScore } }
    })

    scored.sort((a, b) => {
      const dr = b.scores.rankScore - a.scores.rankScore
      if (dr !== 0) return dr
      const df = b.scores.finalScore - a.scores.finalScore
      if (df !== 0) return df
      return a.row.sku.localeCompare(b.row.sku)
    })

    const top = scored.slice(0, cappedLimit)
    const ineligibleTrail = metas
      .filter((m) => !m.meta.eligible)
      .map((m) => toRecommendationItem(m.row, m.meta, null, false, rankingConfig))
      .sort((a, b) => a.name.localeCompare(b.name))

    const ranked: RecommendationResult[] = top.map((t) =>
      toRecommendationItem(t.row, t.meta, t.scores, exposeRecency, rankingConfig)
    )
    const merged = [...ranked, ...ineligibleTrail]

    if (this.logger && emptyCatalogReason) {
      const avgFinalScore = ranked.reduce((sum, r) => sum + (r.finalScore ?? 0), 0) / (ranked.length || 1)
      const matchReasonDistribution = ranked.reduce(
        (acc, r) => {
          if (r.matchReason) acc[r.matchReason] = (acc[r.matchReason] ?? 0) + 1
          return acc
        },
        {} as Record<MatchReason, number>
      )
      this.logger.info({
        clientId,
        country: client.country,
        resultsCount: merged.length,
        rankedCount: ranked.length,
        avgFinalScore: Math.round(avgFinalScore * 100) / 100,
        matchReasonDistribution,
      })
    }

    return { recommendations: merged, rankingConfig }
  }
}

export { Neo4jUnavailableError }
