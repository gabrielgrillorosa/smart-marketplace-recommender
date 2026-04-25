import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { ModelTrainer, ConflictError, ApiServiceUnavailableError } from '../services/ModelTrainer.js'
import { ModelStore } from '../services/ModelStore.js'
import { Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'

interface ModelRoutesOptions extends FastifyPluginOptions {
  modelTrainer: ModelTrainer
  modelStore: ModelStore
}

export async function modelRoutes(
  fastify: FastifyInstance,
  options: ModelRoutesOptions
): Promise<void> {
  const { modelTrainer, modelStore } = options

  fastify.post('/model/train', async (_request, reply) => {
    try {
      const result = await modelTrainer.train()
      return reply.code(200).send(result)
    } catch (err) {
      if (err instanceof ConflictError) {
        return reply.code(409).send({ error: err.message })
      }
      if (err instanceof ApiServiceUnavailableError) {
        return reply.code(503).send({ error: err.message })
      }
      if (err instanceof Neo4jUnavailableError) {
        return reply.code(503).send({ error: err.message })
      }
      throw err
    }
  })

  fastify.get('/model/status', async (_request, reply) => {
    return reply.code(200).send(modelStore.getEnrichedStatus())
  })
}
