import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { Neo4jRepository, Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'
import { TrainingJobRegistry } from '../services/TrainingJobRegistry.js'
import { ConflictError } from '../services/ModelTrainer.js'

interface OrdersRoutesOptions extends FastifyPluginOptions {
  repo: Neo4jRepository
  registry: TrainingJobRegistry
}

interface SyncAndTrainBody {
  clientId?: string
  productIds?: string[]
  /** ISO-8601 instant or local datetime (required for checkout BOUGHT sync) */
  orderDate?: string
}

function isValidOrderDateString(s: string): boolean {
  const trimmed = s.trim()
  if (!trimmed) return false
  const ms = Date.parse(trimmed)
  return !Number.isNaN(ms)
}

export async function ordersRoutes(
  fastify: FastifyInstance,
  options: OrdersRoutesOptions
): Promise<void> {
  const { repo, registry } = options

  fastify.post<{ Params: { orderId: string }; Body: SyncAndTrainBody }>(
    '/orders/:orderId/sync-and-train',
    async (request, reply) => {
      const { orderId } = request.params
      const { clientId, productIds, orderDate } = request.body ?? {}

      if (!orderId || orderId.trim() === '') {
        return reply.code(400).send({ error: 'orderId is required' })
      }
      if (!clientId || clientId.trim() === '') {
        return reply.code(400).send({ error: 'clientId is required' })
      }
      if (typeof orderDate !== 'string' || !isValidOrderDateString(orderDate)) {
        return reply.code(400).send({ error: 'orderDate is required and must be a non-empty ISO-8601 datetime string' })
      }
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return reply.code(400).send({ error: 'productIds must be a non-empty array of strings' })
      }
      if (productIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
        return reply.code(400).send({ error: 'productIds must be a non-empty array of strings' })
      }

      const orderDateIso = new Date(orderDate.trim()).toISOString()
      const uniqueProductIds = Array.from(new Set(productIds.map((id) => id.trim())))
      const edges = uniqueProductIds.map((productId) => ({
        clientId: clientId.trim(),
        productId,
        orderId: orderId.trim(),
        orderDate: orderDateIso,
      }))

      try {
        const synced = await repo.syncBoughtRelationships(edges)
        const training = registry.enqueue({
          triggeredBy: 'checkout',
          orderId,
          strategy: 'queue',
        })

        return reply.code(202).send({
          orderId,
          synced,
          training,
        })
      } catch (err) {
        if (err instanceof Neo4jUnavailableError) {
          return reply.code(503).send({ error: err.message })
        }
        if (err instanceof ConflictError) {
          return reply.code(409).send({ error: err.message, jobId: registry.getActiveJobId() })
        }
        throw err
      }
    }
  )
}
