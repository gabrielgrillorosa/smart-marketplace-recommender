import * as tf from '@tensorflow/tfjs-node'
import { FastifyBaseLogger } from 'fastify'
import { ModelStore } from './ModelStore.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { Neo4jUnavailableError, ClientNotFoundError } from '../repositories/Neo4jRepository.js'
import { RecommendationResult, MatchReason } from '../types/index.js'

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

type EmptyRecommendationResponse = { recommendations: []; reason: string }
type RecommendResponse = RecommendationResult[] | EmptyRecommendationResponse

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

export function meanPooling(embeddings: number[][]): number[] {
  const dims = embeddings[0].length
  const mean = new Array<number>(dims).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < dims; i++) mean[i] += emb[i]
  }
  return mean.map((v) => v / embeddings.length)
}

export function computeFinalScore(
  neuralScore: number,
  semanticScore: number,
  neuralWeight: number,
  semanticWeight: number
): number {
  return neuralWeight * neuralScore + semanticWeight * semanticScore
}

export class RecommendationService {
  constructor(
    private readonly modelStore: ModelStore,
    private readonly repo: Neo4jRepository,
    private readonly neuralWeight: number,
    private readonly semanticWeight: number,
    private readonly logger?: FastifyBaseLogger
  ) {}

  async recommend(clientId: string, limit: number): Promise<RecommendResponse> {
    const model = this.modelStore.getModel()
    if (!model) throw new ModelNotTrainedError()

    const client = await this.repo.getClientWithCountry(clientId)
    if (!client) throw new ClientNotFoundError()

    const [purchasedIds, purchasedEmbeddings] = await Promise.all([
      this.repo.getPurchasedProductIds(clientId),
      this.repo.getClientPurchasedEmbeddings(clientId),
    ])

    if (purchasedEmbeddings.length === 0) throw new ClientNoPurchaseHistoryError()

    const clientProfileVector = meanPooling(purchasedEmbeddings)

    const rawCandidates = await this.repo.getCandidateProducts(client.country, purchasedIds)

    // getCandidateProducts already filters WHERE p.embedding IS NOT NULL in Cypher,
    // but we validate here as a defensive layer and to satisfy the spec requirement
    const candidates = rawCandidates.filter((c) => {
      if (!c.embedding || c.embedding.length === 0) {
        console.warn(`[RecommendationService] Product ${c.id} skipped: no embedding`)
        return false
      }
      return true
    })

    if (candidates.length === 0) {
      this.logger?.info({ clientId, reason: 'no_candidates' })
      return {
        recommendations: [],
        reason: 'No new products available for this client in their country',
      }
    }

    // All async I/O complete — enter tf.tidy() (ADR-008)
    const cappedLimit = Math.min(limit, 50)

    const results: RecommendationResult[] = tf.tidy(() => {
      const batchMatrix = tf.tensor2d(
        candidates.map((c) => [...c.embedding, ...clientProfileVector]),
        [candidates.length, 768]
      )
      const outputTensor = model.predict(batchMatrix) as tf.Tensor
      const neuralScores = outputTensor.dataSync() as Float32Array

      return candidates.map((candidate, i) => {
        const neuralScore = neuralScores[i]
        const semanticScore = cosine(clientProfileVector, candidate.embedding)
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

        return {
          id: candidate.id,
          name: candidate.name,
          category: candidate.category,
          price: candidate.price,
          sku: candidate.sku,
          finalScore,
          neuralScore,
          semanticScore,
          matchReason,
        }
      })
    })

    results.sort((a, b) => b.finalScore - a.finalScore)
    const sliced = results.slice(0, cappedLimit)

    if (this.logger) {
      const avgFinalScore = sliced.reduce((sum, r) => sum + r.finalScore, 0) / (sliced.length || 1)
      const matchReasonDistribution = sliced.reduce(
        (acc, r) => {
          acc[r.matchReason] = (acc[r.matchReason] ?? 0) + 1
          return acc
        },
        {} as Record<MatchReason, number>
      )
      this.logger.info({
        clientId,
        country: client.country,
        resultsCount: sliced.length,
        avgFinalScore: Math.round(avgFinalScore * 100) / 100,
        matchReasonDistribution,
      })
    }

    return sliced
  }

  async recommendFromCart(
    clientId: string,
    productIds: string[],
    limit: number
  ): Promise<RecommendResponse> {
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

    const [purchasedIds, purchasedEmbeddings, cartEmbeddings] = await Promise.all([
      this.repo.getPurchasedProductIds(clientId),
      this.repo.getClientPurchasedEmbeddings(clientId),
      this.repo.getProductEmbeddings(uniqueCartProductIds),
    ])

    const profileEmbeddings = [...purchasedEmbeddings, ...cartEmbeddings]
    if (profileEmbeddings.length === 0) throw new ClientNoPurchaseHistoryError()

    const clientProfileVector = meanPooling(profileEmbeddings)
    const excludedIds = Array.from(new Set([...purchasedIds, ...uniqueCartProductIds]))
    const rawCandidates = await this.repo.getCandidateProducts(client.country, excludedIds)

    const candidates = rawCandidates.filter((candidate) => {
      if (!candidate.embedding || candidate.embedding.length === 0) {
        console.warn(`[RecommendationService] Product ${candidate.id} skipped: no embedding`)
        return false
      }
      return true
    })

    if (candidates.length === 0) {
      return {
        recommendations: [],
        reason: 'No new products available for this client in their country',
      }
    }

    const cappedLimit = Math.min(limit, 50)

    const results: RecommendationResult[] = tf.tidy(() => {
      const batchMatrix = tf.tensor2d(
        candidates.map((candidate) => [...candidate.embedding, ...clientProfileVector]),
        [candidates.length, 768]
      )
      const outputTensor = model.predict(batchMatrix) as tf.Tensor
      const neuralScores = outputTensor.dataSync() as Float32Array

      return candidates.map((candidate, index) => {
        const neuralScore = neuralScores[index]
        const semanticScore = cosine(clientProfileVector, candidate.embedding)
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

        return {
          id: candidate.id,
          name: candidate.name,
          category: candidate.category,
          price: candidate.price,
          sku: candidate.sku,
          finalScore,
          neuralScore,
          semanticScore,
          matchReason,
        }
      })
    })

    results.sort((a, b) => b.finalScore - a.finalScore)
    return results.slice(0, cappedLimit)
  }

  async recommendFromVector(
    clientId: string,
    limit: number,
    profileVector: number[]
  ): Promise<RecommendationResult[]> {
    const model = this.modelStore.getModel()
    if (!model) throw new ModelNotTrainedError()

    const client = await this.repo.getClientWithCountry(clientId)
    if (!client) throw new ClientNotFoundError()

    const purchasedIds = await this.repo.getPurchasedProductIds(clientId)
    const rawCandidates = await this.repo.getCandidateProducts(client.country, purchasedIds)

    const candidates = rawCandidates.filter((c) => {
      if (!c.embedding || c.embedding.length === 0) {
        return false
      }
      return true
    })

    if (candidates.length === 0) {
      return []
    }

    const cappedLimit = Math.min(limit, 50)

    const results: RecommendationResult[] = tf.tidy(() => {
      const batchMatrix = tf.tensor2d(
        candidates.map((c) => [...c.embedding, ...profileVector]),
        [candidates.length, 768]
      )
      const outputTensor = model.predict(batchMatrix) as tf.Tensor
      const neuralScores = outputTensor.dataSync() as Float32Array

      return candidates.map((candidate, i) => {
        const neuralScore = neuralScores[i]
        const semanticScore = cosine(profileVector, candidate.embedding)
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

        return {
          id: candidate.id,
          name: candidate.name,
          category: candidate.category,
          price: candidate.price,
          sku: candidate.sku,
          finalScore,
          neuralScore,
          semanticScore,
          matchReason,
        }
      })
    })

    results.sort((a, b) => b.finalScore - a.finalScore)
    return results.slice(0, cappedLimit)
  }
}

export { Neo4jUnavailableError }
