import * as tf from '@tensorflow/tfjs-node'
import { ModelStore } from './ModelStore.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'
import { RecommendationResult, MatchReason } from '../types/index.js'

export class ModelNotTrainedError extends Error {
  readonly statusCode = 503
  constructor() {
    super('Model not trained. Call POST /api/v1/model/train first.')
    this.name = 'ModelNotTrainedError'
  }
}

export class ClientNotFoundError extends Error {
  readonly statusCode = 404
  constructor() {
    super('Client not found')
    this.name = 'ClientNotFoundError'
  }
}

export class ClientNoPurchaseHistoryError extends Error {
  readonly statusCode = 422
  constructor() {
    super('Client has no purchase history. Cannot compute profile vector.')
    this.name = 'ClientNoPurchaseHistoryError'
  }
}

type EmptyRecommendationResponse = { recommendations: []; reason: string }
type RecommendResponse = RecommendationResult[] | EmptyRecommendationResponse

function cosine(a: number[], b: number[]): number {
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

function meanPooling(embeddings: number[][]): number[] {
  const dims = embeddings[0].length
  const mean = new Array<number>(dims).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < dims; i++) mean[i] += emb[i]
  }
  return mean.map((v) => v / embeddings.length)
}

export class RecommendationService {
  constructor(
    private readonly modelStore: ModelStore,
    private readonly repo: Neo4jRepository,
    private readonly neuralWeight: number,
    private readonly semanticWeight: number,
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

    const candidates = await this.repo.getCandidateProducts(client.country, purchasedIds)

    if (candidates.length === 0) {
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
        const finalScore = this.neuralWeight * neuralScore + this.semanticWeight * semanticScore

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
