import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import {
  RecommendationService,
  ModelNotTrainedError,
  ClientNotFoundError,
  ClientNoPurchaseHistoryError,
} from '../services/RecommendationService.js'
import { Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'

interface RecommendRoutesOptions extends FastifyPluginOptions {
  recommendationService: RecommendationService
}

interface RecommendBody {
  clientId?: string
  limit?: number
  productIds?: string[]
}

export async function recommendRoutes(
  fastify: FastifyInstance,
  options: RecommendRoutesOptions
): Promise<void> {
  const { recommendationService } = options

  fastify.post<{ Body: RecommendBody }>('/recommend', async (request, reply) => {
    const { clientId, limit } = request.body ?? {}

    if (!clientId || clientId.trim() === '') {
      return reply.code(400).send({ error: 'clientId is required' })
    }

    const resolvedLimit = limit ?? 10
    if (resolvedLimit <= 0) {
      return reply.code(400).send({ error: 'limit must be >= 1' })
    }

    try {
      const result = await recommendationService.recommend(clientId, resolvedLimit)
      return reply.code(200).send(result)
    } catch (err) {
      if (err instanceof ModelNotTrainedError) {
        return reply.code(503).send({ error: err.message })
      }
      if (err instanceof ClientNotFoundError) {
        return reply.code(404).send({ error: err.message })
      }
      if (err instanceof ClientNoPurchaseHistoryError) {
        return reply.code(422).send({ error: err.message })
      }
      if (err instanceof Neo4jUnavailableError) {
        return reply.code(503).send({ error: err.message })
      }
      throw err
    }
  })

  fastify.post<{ Body: RecommendBody }>('/recommend/from-cart', async (request, reply) => {
    const { clientId, limit, productIds } = request.body ?? {}

    if (!clientId || clientId.trim() === '') {
      return reply.code(400).send({ error: 'clientId is required' })
    }

    if (productIds !== undefined && !Array.isArray(productIds)) {
      return reply.code(400).send({ error: 'productIds must be an array of strings' })
    }

    if (Array.isArray(productIds) && productIds.some((id) => typeof id !== 'string')) {
      return reply.code(400).send({ error: 'productIds must be an array of strings' })
    }

    const resolvedLimit = limit ?? 10
    if (resolvedLimit <= 0) {
      return reply.code(400).send({ error: 'limit must be >= 1' })
    }

    try {
      const result = await recommendationService.recommendFromCart(clientId, productIds ?? [], resolvedLimit)
      return reply.code(200).send(result)
    } catch (err) {
      if (err instanceof ModelNotTrainedError) {
        return reply.code(503).send({ error: err.message })
      }
      if (err instanceof ClientNotFoundError) {
        return reply.code(404).send({ error: err.message })
      }
      if (err instanceof ClientNoPurchaseHistoryError) {
        return reply.code(422).send({ error: err.message })
      }
      if (err instanceof Neo4jUnavailableError) {
        return reply.code(503).send({ error: err.message })
      }
      throw err
    }
  })
}
