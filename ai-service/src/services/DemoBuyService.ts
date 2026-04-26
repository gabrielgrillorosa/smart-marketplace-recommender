import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { RecommendationService, meanPooling, ClientNoPurchaseHistoryError } from './RecommendationService.js'
import type { RecommendationResult } from '../types/index.js'

export class DemoBuyService {
  constructor(
    private readonly repo: Neo4jRepository,
    private readonly recommendationService: RecommendationService
  ) {}

  async demoBuy(clientId: string, productId: string, limit: number = 10): Promise<RecommendationResult[]> {
    const embeddings = await this.repo.createDemoBoughtAndGetEmbeddings(clientId, productId)
    if (embeddings.length === 0) throw new ClientNoPurchaseHistoryError()
    const profileVector = meanPooling(embeddings)
    return this.recommendationService.recommendFromVector(clientId, limit, profileVector)
  }

  async undoDemoBuy(clientId: string, productId: string, limit: number = 10): Promise<RecommendationResult[]> {
    const embeddings = await this.repo.deleteDemoBoughtAndGetEmbeddings(clientId, productId)
    if (embeddings.length === 0) return []
    const profileVector = meanPooling(embeddings)
    return this.recommendationService.recommendFromVector(clientId, limit, profileVector)
  }

  async clearAllDemoBought(clientId: string, limit: number = 10): Promise<RecommendationResult[]> {
    const embeddings = await this.repo.clearAllDemoBoughtAndGetEmbeddings(clientId)
    if (embeddings.length === 0) return []
    const profileVector = meanPooling(embeddings)
    return this.recommendationService.recommendFromVector(clientId, limit, profileVector)
  }
}
