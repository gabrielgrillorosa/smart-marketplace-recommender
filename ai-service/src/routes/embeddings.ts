import { FastifyPluginAsync } from 'fastify'
import { EmbeddingService, AlreadyRunningError } from '../services/EmbeddingService.js'
import { Neo4jRepository, Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'

interface EmbeddingsPluginOptions {
  embeddingService: EmbeddingService
  repo: Neo4jRepository
}

export const embeddingsRoutes: FastifyPluginAsync<EmbeddingsPluginOptions> = async (
  fastify,
  { embeddingService, repo }
) => {
  fastify.post('/embeddings/generate', async (_request, reply) => {
    try {
      const result = await embeddingService.generateEmbeddings(repo)
      return reply.code(200).send(result)
    } catch (err) {
      if (err instanceof AlreadyRunningError) {
        return reply.code(409).send({ error: 'Generation already in progress' })
      }
      if (err instanceof Neo4jUnavailableError) {
        return reply.code(503).send({ error: 'Neo4j unavailable' })
      }
      throw err
    }
  })
}
