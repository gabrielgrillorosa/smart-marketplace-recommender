import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { EmbeddingService } from '../services/EmbeddingService.js'
import { StartupRecoveryService } from '../services/StartupRecoveryService.js'
import { VersionedModelStore } from '../services/VersionedModelStore.js'

interface StartupProbeOptions {
  embeddingService: EmbeddingService
  versionedModelStore: VersionedModelStore
  startupRecoveryService: StartupRecoveryService
}

interface StartupListenOptions extends StartupProbeOptions {
  autoHealModel: boolean
  port: number
  host: string
  logger?: Pick<FastifyBaseLogger, 'info'>
}

export function registerStartupProbes(
  fastify: FastifyInstance,
  options: StartupProbeOptions
): void {
  fastify.get('/health', async () => ({ status: 'ok', service: 'ai-service' }))

  fastify.get('/ready', async (_request, reply) => {
    const embeddingReady = options.embeddingService.isReady
    const modelPresent = options.versionedModelStore.getModel() !== null
    const recoveryBlocking = options.startupRecoveryService.isBlockingReadiness()
    const ready = embeddingReady && modelPresent && !recoveryBlocking

    return reply.code(ready ? 200 : 503).send({
      ready,
      embeddingReady,
      modelPresent,
      recoveryBlocking,
    })
  })
}

export async function listenAndScheduleRecovery(
  fastify: FastifyInstance,
  options: StartupListenOptions
): Promise<void> {
  await fastify.listen({ port: options.port, host: options.host })
  options.logger?.info(`AI Service listening on port ${options.port}`)

  if (options.autoHealModel) {
    void options.startupRecoveryService.scheduleRecovery()
  }
}
