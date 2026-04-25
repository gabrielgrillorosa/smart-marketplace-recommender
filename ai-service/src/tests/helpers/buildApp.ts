import Fastify, { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { Neo4jRepository } from '../../repositories/Neo4jRepository.js'
import type { EmbeddingService } from '../../services/EmbeddingService.js'
import type { ModelStore } from '../../services/ModelStore.js'
import type { ModelTrainer } from '../../services/ModelTrainer.js'
import type { RecommendationService } from '../../services/RecommendationService.js'
import type { RAGService } from '../../services/RAGService.js'
import type { SearchService } from '../../services/SearchService.js'
import { embeddingsRoutes } from '../../routes/embeddings.js'
import { searchRoutes } from '../../routes/search.js'
import { ragRoutes } from '../../routes/rag.js'
import { modelRoutes } from '../../routes/model.js'
import { recommendRoutes } from '../../routes/recommend.js'

export interface AppDeps {
  neo4jRepo: Partial<Neo4jRepository>
  embeddingService: Partial<EmbeddingService>
  modelStore: Partial<ModelStore>
  modelTrainer: Partial<ModelTrainer>
  recommendationService: Partial<RecommendationService>
  ragService: Partial<RAGService>
  searchService: Partial<SearchService>
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false })

  await fastify.register(embeddingsRoutes, {
    prefix: '/api/v1',
    embeddingService: deps.embeddingService as EmbeddingService,
    repo: deps.neo4jRepo as Neo4jRepository,
  })

  await fastify.register(searchRoutes, {
    prefix: '/api/v1',
    searchService: deps.searchService as SearchService,
  })

  await fastify.register(ragRoutes, {
    prefix: '/api/v1',
    ragService: deps.ragService as RAGService,
  })

  await fastify.register(modelRoutes, {
    prefix: '/api/v1',
    modelTrainer: deps.modelTrainer as ModelTrainer,
    modelStore: deps.modelStore as ModelStore,
  })

  await fastify.register(recommendRoutes, {
    prefix: '/api/v1',
    recommendationService: deps.recommendationService as RecommendationService,
  })

  return fastify
}

export type { FastifyBaseLogger }
