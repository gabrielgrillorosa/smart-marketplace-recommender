import { FastifyPluginAsync } from 'fastify'
import { TrainingJobRegistry } from '../services/TrainingJobRegistry.js'
import { ConflictError } from '../services/ModelTrainer.js'

interface AdminRoutesOptions {
  registry: TrainingJobRegistry
  adminApiKey?: string
}

export const adminRoutes: FastifyPluginAsync<AdminRoutesOptions> = async (
  fastify,
  { registry, adminApiKey }
) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const provided = request.headers['x-admin-key']
    const expected = adminApiKey ?? process.env.ADMIN_API_KEY

    if (!expected || provided !== expected) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  fastify.post('/model/train', async (_request, reply) => {
    try {
      const result = registry.enqueue()
      return reply.code(202).send(result)
    } catch (err) {
      if (err instanceof ConflictError) {
        return reply.code(409).send({ error: err.message })
      }
      throw err
    }
  })

  fastify.get('/model/train/status/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
    const job = registry.getJob(jobId)
    if (!job) {
      return reply.code(404).send({ error: 'Job not found' })
    }
    return reply.code(200).send(job)
  })
}
