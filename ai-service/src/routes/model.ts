import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { ModelStore } from '../services/ModelStore.js'
import { VersionedModelStore } from '../services/VersionedModelStore.js'
import { CronScheduler } from '../services/CronScheduler.js'

interface ModelRoutesOptions extends FastifyPluginOptions {
  modelTrainer?: never
  modelStore: ModelStore
  cronScheduler?: CronScheduler
  versionedModelStore?: VersionedModelStore
}

export async function modelRoutes(
  fastify: FastifyInstance,
  options: ModelRoutesOptions
): Promise<void> {
  const { modelStore, cronScheduler, versionedModelStore } = options

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
}
