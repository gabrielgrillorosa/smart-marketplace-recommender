import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { ModelStore } from '../services/ModelStore.js'
import { VersionedModelStore } from '../services/VersionedModelStore.js'
import { CronScheduler } from '../services/CronScheduler.js'
import { TrainingJobRegistry } from '../services/TrainingJobRegistry.js'
import { parseNeuralArchProfileEnv } from '../config/neuralArchEnv.js'
import { buildProfilePoolingRuntimeFromEnv } from '../config/profilePoolingEnv.js'

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
  const runtimePooling = buildProfilePoolingRuntimeFromEnv(process.env)
  const runtimeArchProfile = parseNeuralArchProfileEnv(process.env.NEURAL_ARCH_PROFILE)

  fastify.get('/model/status', async (_request, reply) => {
    const base = modelStore.getEnrichedStatus()
    const governance = versionedModelStore?.getGovernanceStatus() ?? {
      currentVersion: null,
      lastTrainingResult: null,
      lastTrainingTriggeredBy: null,
      lastOrderId: null,
      lastDecision: null,
    }
    const activeJobId = registry?.getActiveJobId()
    const status = activeJobId ? 'training' : base.status
    const withRuntimeFallback = {
      ...base,
      modelArchitectureProfile: base.modelArchitectureProfile ?? runtimeArchProfile,
      poolingMode: base.poolingMode ?? runtimePooling.mode,
      poolingHalfLifeDays: base.poolingHalfLifeDays ?? runtimePooling.halfLifeDays,
      poolingAttentionTemperature:
        base.poolingAttentionTemperature ??
        (runtimePooling.mode === 'attention_light' || runtimePooling.mode === 'attention_learned'
          ? (runtimePooling.attentionTemperature ?? null)
          : undefined),
      poolingAttentionMaxEntries:
        base.poolingAttentionMaxEntries ??
        (runtimePooling.mode === 'attention_light' || runtimePooling.mode === 'attention_learned'
          ? (runtimePooling.attentionMaxEntries ?? 0)
          : undefined),
    }

    if (!versionedModelStore) {
      return reply.code(200).send({
        ...withRuntimeFallback,
        status,
        currentVersion: governance.currentVersion,
        lastTrainingResult: governance.lastTrainingResult,
        lastTrainingTriggeredBy: governance.lastTrainingTriggeredBy,
        lastOrderId: governance.lastOrderId,
        lastDecision: governance.lastDecision,
      })
    }

    const models = await versionedModelStore.getHistory()
    const currentModel = governance.currentVersion ?? models.find((m) => m.accepted)?.filename

    const enriched = {
      ...withRuntimeFallback,
      status,
      currentModel,
      models,
      nextScheduledTraining: cronScheduler?.getNextExecution().toISOString(),
      currentVersion: governance.currentVersion,
      lastTrainingResult: governance.lastTrainingResult,
      lastTrainingTriggeredBy: governance.lastTrainingTriggeredBy,
      lastOrderId: governance.lastOrderId,
      lastDecision: governance.lastDecision,
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
