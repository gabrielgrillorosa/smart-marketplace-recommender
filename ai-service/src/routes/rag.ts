import { FastifyPluginAsync } from 'fastify'
import { RAGService, LLMNotConfiguredError, LLMError } from '../services/RAGService.js'
import { Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'
import { ModelNotReadyError } from '../services/SearchService.js'

interface RAGBody {
  query: string
}

interface RAGPluginOptions {
  ragService: RAGService
}

export const ragRoutes: FastifyPluginAsync<RAGPluginOptions> = async (
  fastify,
  { ragService }
) => {
  fastify.post<{ Body: RAGBody }>('/rag/query', async (request, reply) => {
    const { query } = request.body ?? {}

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return reply.code(400).send({ error: 'query is required and must be non-empty' })
    }

    try {
      const result = await ragService.query(query)
      return reply.code(200).send(result)
    } catch (err) {
      if (err instanceof LLMNotConfiguredError) {
        return reply.code(503).send({ error: 'LLM not configured. Set OPENROUTER_API_KEY env var.' })
      }
      if (err instanceof LLMError) {
        return reply.code(502).send({ error: err.message, sources: err.sources })
      }
      if (err instanceof Neo4jUnavailableError) {
        return reply.code(503).send({ error: 'Neo4j unavailable' })
      }
      if (err instanceof ModelNotReadyError) {
        return reply.code(503).send({ error: 'Model loading. Retry in a few seconds.' })
      }
      throw err
    }
  })
}
