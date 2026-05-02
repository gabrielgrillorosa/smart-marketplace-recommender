import Fastify from 'fastify'
import cors from '@fastify/cors'
import neo4j from 'neo4j-driver'
import { Pool } from 'pg'
import { ENV } from './config/env.js'
import { Neo4jRepository } from './repositories/Neo4jRepository.js'
import { EmbeddingService } from './services/EmbeddingService.js'
import { SearchService } from './services/SearchService.js'
import { RAGService } from './services/RAGService.js'
import { VersionedModelStore } from './services/VersionedModelStore.js'
import { ModelTrainer } from './services/ModelTrainer.js'
import { TrainingJobRegistry } from './services/TrainingJobRegistry.js'
import { CronScheduler } from './services/CronScheduler.js'
import { StartupRecoveryService } from './services/StartupRecoveryService.js'
import { RecommendationService } from './services/RecommendationService.js'
import { AutoSeedService } from './services/AutoSeedService.js'
import { embeddingsRoutes } from './routes/embeddings.js'
import { searchRoutes } from './routes/search.js'
import { ragRoutes } from './routes/rag.js'
import { modelRoutes } from './routes/model.js'
import { recommendRoutes } from './routes/recommend.js'
import { adminRoutes } from './routes/adminRoutes.js'
import { ordersRoutes } from './routes/orders.js'
import { listenAndScheduleRecovery, registerStartupProbes } from './startup/bootstrap.js'
import { ProfilePoolingRuntimeHolder } from './config/profilePoolingRuntimeHolder.js'
import { buildProfilePoolingRuntimeFromEnv, resolveAttentionLearnedJsonPath } from './config/profilePoolingEnv.js'
import { generateAttentionLearnedJson } from './services/attentionLearnedJsonGenerator.js'

const fastify = Fastify({ logger: true })

export async function start(): Promise<void> {
  try {
    await fastify.register(cors, {
      origin: (origin, cb) => {
        cb(null, true)
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })

    // Step 2: Neo4j driver singleton
    const driver = neo4j.driver(
      ENV.NEO4J_URI,
      neo4j.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD)
    )

    const repo = new Neo4jRepository(driver)
    const embeddingService = new EmbeddingService(ENV.EMBEDDING_MODEL)

    // Step 3: VersionedModelStore (extends ModelStore)
    const versionedModelStore = new VersionedModelStore()

    // Step 4: Load current model from symlink (graceful no-op when absent)
    await versionedModelStore.loadCurrent()

    // Step 5: Embedding model warm-up
    fastify.log.info(`[ai-service] Loading embedding model: ${ENV.EMBEDDING_MODEL}`)
    await embeddingService.init()
    fastify.log.info('[ai-service] Embedding model ready')

    const profilePoolingHolder = new ProfilePoolingRuntimeHolder(ENV.PROFILE_POOLING_RUNTIME)

    const reloadProfilePoolingFromEnv = (): void => {
      profilePoolingHolder.replace(buildProfilePoolingRuntimeFromEnv(process.env))
    }

    const regenerateAttentionLearnedJsonAdmin = async (force: boolean) => {
      const outPath = resolveAttentionLearnedJsonPath(process.env)
      const result = await generateAttentionLearnedJson({
        apiServiceUrl: ENV.API_SERVICE_URL,
        neo4jUri: ENV.NEO4J_URI,
        neo4jUser: ENV.NEO4J_USER,
        neo4jPassword: ENV.NEO4J_PASSWORD,
        outPath,
        negativesPerPositive: parseInt(process.env.ATTENTION_LEARNED_NEGATIVES_PER_POSITIVE ?? '2', 10) || 2,
        skipIfValid: !force,
        logger: fastify.log,
      })
      if (ENV.PROFILE_POOLING_MODE === 'attention_learned') {
        reloadProfilePoolingFromEnv()
      }
      return result
    }

    const afterTrainSuccess = async (): Promise<void> => {
      if (ENV.PROFILE_POOLING_MODE !== 'attention_learned') return
      await regenerateAttentionLearnedJsonAdmin(true)
    }

    const modelTrainer = new ModelTrainer(
      versionedModelStore,
      repo,
      embeddingService,
      ENV.API_SERVICE_URL,
      ENV.NEURAL_WEIGHT,
      ENV.SEMANTIC_WEIGHT,
      profilePoolingHolder,
      ENV.NEURAL_LOSS_MODE,
      ENV.M22_ENV
    )

    // Step 6: TrainingJobRegistry
    const trainingJobRegistry = new TrainingJobRegistry(modelTrainer, versionedModelStore, afterTrainSuccess)

    const startupRecoveryService = new StartupRecoveryService({
      autoHealModel: ENV.AUTO_HEAL_MODEL,
      versionedModelStore,
      embeddingService,
      neo4jRepository: repo,
      modelTrainer,
      trainingJobRegistry,
      logger: fastify.log,
      trainingDataProbeAttempts: 6,
      trainingDataProbeDelayMs: 5_000,
    })

    // Step 7: CronScheduler — daily retraining (optional) + optional attention JSON-only refresh
    const dailyTrainEnabled = process.env.ENABLE_DAILY_TRAIN !== 'false'
    const cronScheduler = new CronScheduler(
      trainingJobRegistry,
      { enabled: dailyTrainEnabled, schedule: process.env.DAILY_TRAIN_CRON ?? '0 2 * * *' },
      {
        attentionLearnedSchedule: process.env.ATTENTION_LEARNED_REFRESH_CRON?.trim() || undefined,
        onAttentionLearnedRefresh: async () => {
          if (ENV.PROFILE_POOLING_MODE !== 'attention_learned') return
          await regenerateAttentionLearnedJsonAdmin(false)
        },
      }
    )
    cronScheduler.start()

    const recommendationService = new RecommendationService(
      versionedModelStore,
      repo,
      ENV.NEURAL_WEIGHT,
      ENV.SEMANTIC_WEIGHT,
      ENV.RECENT_PURCHASE_WINDOW_DAYS,
      ENV.RECENCY_RERANK_WEIGHT,
      ENV.RECENCY_ANCHOR_COUNT,
      profilePoolingHolder,
      ENV.M22_ENV,
      fastify.log,
    )

    const searchService = new SearchService(embeddingService, repo)
    const ragService = new RAGService(embeddingService, repo, ENV.OPENROUTER_API_KEY, ENV.LLM_MODEL, ENV.OPENROUTER_BASE_URL)

    registerStartupProbes(fastify, {
      embeddingService,
      versionedModelStore,
      startupRecoveryService,
    })

    // Step 8: Admin plugin (X-Admin-Key scoped — POST /model/train + status)
    await fastify.register(adminRoutes, {
      prefix: '/api/v1',
      registry: trainingJobRegistry,
      regenerateAttentionLearned: (force) => regenerateAttentionLearnedJsonAdmin(force),
    })

    await fastify.register(embeddingsRoutes, {
      prefix: '/api/v1',
      embeddingService,
      repo,
    })

    await fastify.register(searchRoutes, {
      prefix: '/api/v1',
      searchService,
    })

    await fastify.register(ragRoutes, {
      prefix: '/api/v1',
      ragService,
    })

    await fastify.register(modelRoutes, {
      prefix: '/api/v1',
      modelStore: versionedModelStore,
      cronScheduler,
      versionedModelStore,
      registry: trainingJobRegistry,
    })

    await fastify.register(recommendRoutes, {
      prefix: '/api/v1',
      recommendationService,
    })

    await fastify.register(ordersRoutes, {
      prefix: '/api/v1',
      repo,
      registry: trainingJobRegistry,
    })

    // Step 9.5: Auto-seed PG + Neo4j on cold start (idempotent — skips when data already present).
    // Must complete BEFORE the StartupRecoveryService scheduled inside listenAndScheduleRecovery,
    // because that service walks Neo4j for products to embed/train and would no-op on empty DBs.
    // Uses dedicated short-lived connections so the runtime Neo4j driver and Pool are untouched.
    const autoSeedService = new AutoSeedService({
      enabled: ENV.AUTO_SEED_ON_BOOT,
      poolFactory: () => new Pool({
        host: ENV.POSTGRES_HOST,
        port: ENV.POSTGRES_PORT,
        database: ENV.POSTGRES_DB,
        user: ENV.POSTGRES_USER,
        password: ENV.POSTGRES_PASSWORD,
      }),
      driverFactory: () => neo4j.driver(ENV.NEO4J_URI, neo4j.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD)),
      logger: fastify.log,
    })
    await autoSeedService.runIfNeeded()

    // Step 10: Start accepting traffic and schedule self-healing only after listen().
    // When AUTO_HEAL_MODEL: always run StartupRecovery (gap-fill embeddings in Neo4j even if a model
    // is already on disk; enqueue train only when no model is loaded).
    await listenAndScheduleRecovery(fastify, {
      autoHealModel: ENV.AUTO_HEAL_MODEL,
      embeddingService,
      versionedModelStore,
      startupRecoveryService,
      port: ENV.PORT,
      host: '0.0.0.0',
      logger: fastify.log,
    })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}