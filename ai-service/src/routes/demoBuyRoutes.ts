import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { DemoBuyService } from '../services/DemoBuyService.js'
import { ClientNotFoundError, ProductNotFoundError, Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'
import { ModelNotTrainedError, ClientNoPurchaseHistoryError } from '../services/RecommendationService.js'

interface DemoBuyRoutesOptions extends FastifyPluginOptions {
  demoBuyService: DemoBuyService
}

interface DemoBuyBody {
  clientId?: string
  productId?: string
  limit?: number
}

export async function demoBuyRoutes(
  fastify: FastifyInstance,
  options: DemoBuyRoutesOptions
): Promise<void> {
  const { demoBuyService } = options

  fastify.post<{ Body: DemoBuyBody }>('/demo-buy', async (request, reply) => {
    const { clientId, productId, limit } = request.body ?? {}

    if (!clientId || clientId.trim() === '') {
      return reply.code(400).send({ error: 'clientId is required' })
    }
    if (!productId || productId.trim() === '') {
      return reply.code(400).send({ error: 'productId is required' })
    }

    const resolvedLimit = limit ?? 10
    if (resolvedLimit <= 0) {
      return reply.code(400).send({ error: 'limit must be >= 1' })
    }

    try {
      const recommendations = await demoBuyService.demoBuy(clientId, productId, resolvedLimit)
      return reply.code(200).send({ recommendations })
    } catch (err) {
      if (err instanceof ClientNotFoundError || err instanceof ProductNotFoundError) {
        return reply.code(404).send({ error: (err as Error).message })
      }
      if (err instanceof ClientNoPurchaseHistoryError) {
        return reply.code(422).send({ error: (err as Error).message })
      }
      if (err instanceof ModelNotTrainedError || err instanceof Neo4jUnavailableError) {
        return reply.code(503).send({ error: (err as Error).message })
      }
      throw err
    }
  })

  fastify.delete<{ Params: { clientId: string; productId: string } }>(
    '/demo-buy/:clientId/:productId',
    async (request, reply) => {
      const { clientId, productId } = request.params

      try {
        const recommendations = await demoBuyService.undoDemoBuy(clientId, productId)
        return reply.code(200).send({ recommendations })
      } catch (err) {
        if (err instanceof ClientNotFoundError || err instanceof ProductNotFoundError) {
          return reply.code(404).send({ error: (err as Error).message })
        }
        if (err instanceof ModelNotTrainedError || err instanceof Neo4jUnavailableError) {
          return reply.code(503).send({ error: (err as Error).message })
        }
        throw err
      }
    }
  )

  fastify.delete<{ Params: { clientId: string } }>(
    '/demo-buy/:clientId',
    async (request, reply) => {
      const { clientId } = request.params

      try {
        const recommendations = await demoBuyService.clearAllDemoBought(clientId)
        return reply.code(200).send({ recommendations })
      } catch (err) {
        if (err instanceof ClientNotFoundError) {
          return reply.code(404).send({ error: (err as Error).message })
        }
        if (err instanceof ModelNotTrainedError || err instanceof Neo4jUnavailableError) {
          return reply.code(503).send({ error: (err as Error).message })
        }
        throw err
      }
    }
  )
}
