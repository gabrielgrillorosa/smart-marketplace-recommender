import { EmbeddingService } from './EmbeddingService.js'
import { Neo4jRepository, Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'
import { SearchResult, SearchFilters } from '../types/index.js'

export class ModelNotReadyError extends Error {
  constructor() {
    super('Model loading. Retry in a few seconds.')
    this.name = 'ModelNotReadyError'
  }
}

export class IndexNotFoundError extends Error {
  constructor() {
    super('Embedding index not found. Run POST /api/v1/embeddings/generate first.')
    this.name = 'IndexNotFoundError'
  }
}

export class SearchService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly repo: Neo4jRepository
  ) {}

  async semanticSearch(
    query: string,
    limit: number,
    filters?: SearchFilters
  ): Promise<SearchResult[]> {
    if (!this.embeddingService.isReady) {
      throw new ModelNotReadyError()
    }

    const clampedLimit = Math.min(limit ?? 10, 50)

    const embedding = await this.embeddingService.embedText(query)

    try {
      const results = await this.repo.vectorSearch(embedding, clampedLimit, filters)
      return results.sort((a, b) => b.score - a.score)
    } catch (err) {
      if (err instanceof Neo4jUnavailableError) throw err
      // If the vector index doesn't exist, Neo4j throws an error mentioning the index name
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes('product_embeddings')
      ) {
        throw new IndexNotFoundError()
      }
      throw err
    }
  }
}
