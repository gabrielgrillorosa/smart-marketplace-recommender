import { FastifyPluginAsync, FastifyPluginOptions } from 'fastify'
import { isCheckoutEnqueueTrainingEnabled } from '../config/checkoutEnqueueEnv.js'
import { Neo4jRepository, Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'
import { EmbeddingService } from '../services/EmbeddingService.js'
import { TrainingJobRegistry } from '../services/TrainingJobRegistry.js'
import { ConflictError } from '../services/ModelTrainer.js'

interface IntegrationEventsOptions extends FastifyPluginOptions {
  repo: Neo4jRepository
  embeddingService: EmbeddingService
  registry?: TrainingJobRegistry
}

interface ProductUpsertedBody {
  productId?: string
  sku?: string
  name?: string
  description?: string
  category?: string
  price?: number
  supplierId?: string
  supplierName?: string
  supplierCountryCode?: string
  countryCodes?: string[]
}

interface CheckoutCompletedItemBody {
  productId?: string
  quantity?: number
  unitPrice?: number
}

interface CheckoutCompletedBody {
  orderId?: string
  clientId?: string
  orderDate?: string
  items?: CheckoutCompletedItemBody[]
}

function isValidOrderDateString(s: string): boolean {
  const trimmed = s.trim()
  if (!trimmed) return false
  const ms = Date.parse(trimmed)
  return !Number.isNaN(ms)
}

export const integrationEventsRoutes: FastifyPluginAsync<IntegrationEventsOptions> = async (
  fastify,
  { repo, embeddingService, registry }
) => {
  fastify.post<{ Body: ProductUpsertedBody }>('/events/product-upserted', async (request, reply) => {
    const {
      productId,
      sku,
      name,
      description,
      category,
      price,
      supplierId,
      supplierName,
      supplierCountryCode,
      countryCodes,
    } = request.body

    if (
      !productId || !sku || !name || !description || !category ||
      price === undefined || !supplierId || !supplierName || !supplierCountryCode ||
      !Array.isArray(countryCodes) || countryCodes.length === 0
    ) {
      return reply.code(400).send({ error: 'Missing required fields' })
    }

    try {
      const embedding = await embeddingService.embedText(`${name} ${description} ${category}`)
      await repo.upsertProductProjectionWithEmbedding(
        {
          id: productId,
          sku,
          name,
          description,
          category,
          price,
          supplierId,
          supplierName,
          supplierCountryCode,
          countryCodes,
        },
        embedding
      )
      return reply.code(200).send({ synced: true, productId })
    } catch (err) {
      if (err instanceof Neo4jUnavailableError) {
        return reply.code(503).send({ error: 'Neo4j unavailable' })
      }
      throw err
    }
  })

  fastify.post<{ Body: CheckoutCompletedBody }>('/events/order-checkout-completed', async (request, reply) => {
    const { orderId, clientId, orderDate, items } = request.body

    if (!orderId || orderId.trim() === '') {
      return reply.code(400).send({ error: 'orderId is required' })
    }
    if (!clientId || clientId.trim() === '') {
      return reply.code(400).send({ error: 'clientId is required' })
    }
    if (typeof orderDate !== 'string' || !isValidOrderDateString(orderDate)) {
      return reply.code(400).send({ error: 'orderDate is required and must be a non-empty ISO-8601 datetime string' })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'items must be a non-empty array' })
    }

    const seenProductIds = new Set<string>()
    for (const item of items) {
      if (!item.productId || item.productId.trim() === '' || !Number.isInteger(item.quantity) || (item.quantity ?? 0) <= 0) {
        return reply.code(400).send({ error: 'items must contain valid productId and positive quantity' })
      }
      if (seenProductIds.has(item.productId.trim())) {
        return reply.code(400).send({ error: 'items must not repeat productId within the same order event' })
      }
      seenProductIds.add(item.productId.trim())
    }

    const orderDateIso = new Date(orderDate.trim()).toISOString()
    const edges = items.map((item) => ({
      clientId: clientId.trim(),
      productId: item.productId!.trim(),
      orderId: orderId.trim(),
      orderDate: orderDateIso,
      quantity: item.quantity!,
    }))

    try {
      const synced = await repo.syncBoughtRelationships(edges)
      const enqueueTraining = isCheckoutEnqueueTrainingEnabled()
      const training =
        enqueueTraining && registry
          ? registry.enqueue({
              triggeredBy: 'checkout',
              orderId: orderId.trim(),
              strategy: 'queue',
            })
          : { enqueued: false as const }

      return reply.code(202).send({
        orderId,
        synced,
        training,
      })
    } catch (err) {
      if (err instanceof Neo4jUnavailableError) {
        return reply.code(503).send({ error: err.message })
      }
      if (err instanceof ConflictError && registry) {
        return reply.code(409).send({ error: err.message, jobId: registry.getActiveJobId() })
      }
      throw err
    }
  })
}
