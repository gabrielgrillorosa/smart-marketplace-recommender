import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { ModelStore } from '../services/ModelStore.js'
import { VersionedModelStore } from '../services/VersionedModelStore.js'
import { CronScheduler } from '../services/CronScheduler.js'
import { TrainingJobRegistry } from '../services/TrainingJobRegistry.js'

interface ModelRoutesOptions extends FastifyPluginOptions {
  modelTrainer?: never
  modelStore: ModelStore
  cronScheduler?: CronScheduler
  versionedModelStore?: VersionedModelStore
  registry?: TrainingJobRegistry
}

export async function modelRoutes(
  fastify: FastifyInstance,
  options: ModelRoutesOptions
): Promise<void> {
  const { modelStore, cronScheduler, versionedModelStore, registry } = options

  fastify.get('/model/status', async (_request, reply) => {
    const base = modelStore.getEnrichedStatus()

    if (!versionedModelStore || !cronScheduler) {
      return reply.code(200).send(base)
    }

    const models = await versionedModelStore.getHistory()
    let currentModel: string | undefined
    try {
      const history = await versionedModelStore.getHistory()
      currentModel = history.find((m) => m.accepted)?.filename
    } catch {
      // graceful degradation
    }

    const enriched = {
      ...base,
      currentModel,
      models,
      nextScheduledTraining: cronScheduler.getNextExecution().toISOString(),
    }

    return reply.code(200).send(enriched)
  })

  fastify.get('/model/train/status/:jobId', async (request, reply) => {
    if (!registry) {
      return reply.code(503).send({ error: 'TrainingJobRegistry not available' })
    }
    const { jobId } = request.params as { jobId: string }
    const job = registry.getJob(jobId)
    if (!job) {
      return reply.code(404).send({ error: 'Job not found' })
    }
    return reply.code(200).send(job)
  })
}
