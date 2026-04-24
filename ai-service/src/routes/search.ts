import { FastifyPluginAsync } from 'fastify'
import { SearchService, ModelNotReadyError, IndexNotFoundError } from '../services/SearchService.js'
import { Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'
import { SearchFilters } from '../types/index.js'

interface SearchBody {
  query: string
  limit?: number
  filters?: SearchFilters
}

interface SearchPluginOptions {
  searchService: SearchService
}

export const searchRoutes: FastifyPluginAsync<SearchPluginOptions> = async (
  fastify,
  { searchService }
) => {
  fastify.post<{ Body: SearchBody }>('/search/semantic', async (request, reply) => {
    const { query, limit, filters } = request.body ?? {}

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return reply.code(400).send({ error: 'query is required and must be non-empty' })
    }

    if (limit !== undefined && limit < 1) {
      return reply.code(400).send({ error: 'limit must be >= 1' })
    }

    try {
      const results = await searchService.semanticSearch(query, limit ?? 10, filters)
      return reply.code(200).send(results)
    } catch (err) {
      if (err instanceof ModelNotReadyError) {
        return reply.code(503).send({ error: 'Model loading. Retry in a few seconds.' })
      }
      if (err instanceof IndexNotFoundError) {
        return reply
          .code(503)
          .send({ error: 'Embedding index not found. Run POST /api/v1/embeddings/generate first.' })
      }
      if (err instanceof Neo4jUnavailableError) {
        return reply.code(503).send({ error: 'Neo4j unavailable' })
      }
      throw err
    }
  })
}
