import { FastifyPluginAsync } from 'fastify'
import { TrainingJobRegistry } from '../services/TrainingJobRegistry.js'
import { ConflictError } from '../services/ModelTrainer.js'
import type { GenerateAttentionLearnedJsonResult } from '../services/attentionLearnedJsonGenerator.js'

interface AdminRoutesOptions {
  registry: TrainingJobRegistry
  adminApiKey?: string
  /** Optional: regenerate `attention_learned` JSON (corruption / ops). */
  regenerateAttentionLearned?: (force: boolean) => Promise<GenerateAttentionLearnedJsonResult>
}

export const adminRoutes: FastifyPluginAsync<AdminRoutesOptions> = async (
  fastify,
  { registry, adminApiKey, regenerateAttentionLearned }
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
      const result = registry.enqueue({ triggeredBy: 'manual', strategy: 'reject' })
      return reply.code(202).send(result)
    } catch (err) {
      if (err instanceof ConflictError) {
        const activeJobId = registry.getActiveJobId()
        return reply.code(409).send({ error: err.message, jobId: activeJobId })
      }
      throw err
    }
  })

  if (regenerateAttentionLearned) {
    fastify.post<{ Body: { force?: boolean } }>(
      '/admin/attention-learned/regenerate',
      async (request, reply) => {
        const force = request.body?.force === true
        try {
          const result = await regenerateAttentionLearned(force)
          return reply.code(200).send(result)
        } catch (err) {
          return reply.code(500).send({
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    )
  }
}
