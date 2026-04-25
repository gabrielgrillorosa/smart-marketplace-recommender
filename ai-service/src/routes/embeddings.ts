import { FastifyPluginAsync } from 'fastify'
import { EmbeddingService, AlreadyRunningError } from '../services/EmbeddingService.js'
import { Neo4jRepository, Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'

interface EmbeddingsPluginOptions {
  embeddingService: EmbeddingService
  repo: Neo4jRepository
}

interface SyncProductBody {
  id: string
  name: string
  description: string
  category: string
  price: number
  sku: string
  countryCodes: string[]
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

  fastify.post<{ Body: SyncProductBody }>('/embeddings/sync-product', async (request, reply) => {
    const { id, name, description, category, price, sku, countryCodes } = request.body

    if (!id || !name || !description || !category || price === undefined || !sku || !Array.isArray(countryCodes)) {
      return reply.code(400).send({ error: 'Missing required fields' })
    }

    try {
      // Idempotency check: skip if product already has an embedding in Neo4j
      const existing = await repo.getProductEmbedding(id)
      if (existing !== null && existing.length > 0) {
        return reply.code(200).send({ skipped: true, productId: id })
      }

      const text = `${name} ${description} ${category}`
      const embedding = await embeddingService.embedText(text)

      await repo.createProductWithEmbedding(
        { id, name, description, category, price, sku, countryCodes },
        embedding
      )

      return reply.code(200).send({ synced: true, productId: id })
    } catch (err) {
      if (err instanceof Neo4jUnavailableError) {
        return reply.code(503).send({ error: 'Neo4j unavailable' })
      }
      throw err
    }
  })
}
