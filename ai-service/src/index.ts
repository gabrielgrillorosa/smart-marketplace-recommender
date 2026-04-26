import Fastify from 'fastify'
import cors from '@fastify/cors'
import neo4j from 'neo4j-driver'
import { ENV } from './config/env.js'
import { Neo4jRepository } from './repositories/Neo4jRepository.js'
import { EmbeddingService } from './services/EmbeddingService.js'
import { SearchService } from './services/SearchService.js'
import { RAGService } from './services/RAGService.js'
import { VersionedModelStore } from './services/VersionedModelStore.js'
import { ModelTrainer } from './services/ModelTrainer.js'
import { TrainingJobRegistry } from './services/TrainingJobRegistry.js'
import { CronScheduler } from './services/CronScheduler.js'
import { RecommendationService } from './services/RecommendationService.js'
import { DemoBuyService } from './services/DemoBuyService.js'
import { embeddingsRoutes } from './routes/embeddings.js'
import { searchRoutes } from './routes/search.js'
import { ragRoutes } from './routes/rag.js'
import { modelRoutes } from './routes/model.js'
import { recommendRoutes } from './routes/recommend.js'
import { adminRoutes } from './routes/adminRoutes.js'
import { demoBuyRoutes } from './routes/demoBuyRoutes.js'

const fastify = Fastify({ logger: true })

const start = async () => {
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

    const modelTrainer = new ModelTrainer(
      versionedModelStore,
      repo,
      embeddingService,
      ENV.API_SERVICE_URL,
      ENV.NEURAL_WEIGHT,
      ENV.SEMANTIC_WEIGHT,
    )

    // Step 6: TrainingJobRegistry
    const trainingJobRegistry = new TrainingJobRegistry(modelTrainer, versionedModelStore)

    // Step 7: CronScheduler — registers daily retraining at 02:00
    const cronScheduler = new CronScheduler(trainingJobRegistry)
    cronScheduler.start()

    const recommendationService = new RecommendationService(
      versionedModelStore,
      repo,
      ENV.NEURAL_WEIGHT,
      ENV.SEMANTIC_WEIGHT,
      fastify.log,
    )

    const demoBuyService = new DemoBuyService(repo, recommendationService)

    const searchService = new SearchService(embeddingService, repo)
    const ragService = new RAGService(embeddingService, repo, ENV.OPENROUTER_API_KEY, ENV.LLM_MODEL, ENV.OPENROUTER_BASE_URL)

    fastify.get('/health', async () => ({ status: 'ok', service: 'ai-service' }))

    fastify.get('/ready', async (_request, reply) => {
      const ready = embeddingService.isReady
      return reply.code(ready ? 200 : 503).send({ ready })
    })

    // Step 8: Admin plugin (X-Admin-Key scoped — POST /model/train + status)
    await fastify.register(adminRoutes, {
      prefix: '/api/v1',
      registry: trainingJobRegistry,
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

    await fastify.register(demoBuyRoutes, {
      prefix: '/api/v1',
      demoBuyService,
    })

    // Step 10: Start accepting traffic
    await fastify.listen({ port: ENV.PORT, host: '0.0.0.0' })
    fastify.log.info(`AI Service listening on port ${ENV.PORT}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
