import Fastify, { FastifyInstance } from 'fastify'
import type { EmbeddingService } from '../../services/EmbeddingService.js'
import type { StartupRecoveryService } from '../../services/StartupRecoveryService.js'
import type { VersionedModelStore } from '../../services/VersionedModelStore.js'
import { listenAndScheduleRecovery, registerStartupProbes } from '../../startup/bootstrap.js'

interface StartupAppDeps {
  embeddingService: Pick<EmbeddingService, 'isReady'>
  versionedModelStore: { getModel: () => unknown }
  startupRecoveryService: Pick<StartupRecoveryService, 'isBlockingReadiness' | 'scheduleRecovery'>
  autoHealModel?: boolean
}

export async function buildStartupApp(
  deps: StartupAppDeps
): Promise<{ app: FastifyInstance; start: () => Promise<void>; close: () => Promise<void> }> {
  const app = Fastify({ logger: false })

  registerStartupProbes(app, {
    embeddingService: deps.embeddingService as EmbeddingService,
    versionedModelStore: deps.versionedModelStore as VersionedModelStore,
    startupRecoveryService: deps.startupRecoveryService as StartupRecoveryService,
  })

  return {
    app,
    start: async () => {
      await listenAndScheduleRecovery(app, {
        autoHealModel: deps.autoHealModel ?? true,
        embeddingService: deps.embeddingService as EmbeddingService,
        versionedModelStore: deps.versionedModelStore as VersionedModelStore,
        startupRecoveryService: deps.startupRecoveryService as StartupRecoveryService,
        port: 0,
        host: '127.0.0.1',
      })
    },
    close: async () => {
      await app.close()
    },
  }
}
