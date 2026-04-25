import Fastify from 'fastify'
import neo4j from 'neo4j-driver'
import * as tf from '@tensorflow/tfjs-node'
import * as fs from 'node:fs'
import { ENV } from './config/env.js'
import { Neo4jRepository } from './repositories/Neo4jRepository.js'
import { EmbeddingService } from './services/EmbeddingService.js'
import { SearchService } from './services/SearchService.js'
import { RAGService } from './services/RAGService.js'
import { ModelStore } from './services/ModelStore.js'
import { ModelTrainer } from './services/ModelTrainer.js'
import { RecommendationService } from './services/RecommendationService.js'
import { embeddingsRoutes } from './routes/embeddings.js'
import { searchRoutes } from './routes/search.js'
import { ragRoutes } from './routes/rag.js'
import { modelRoutes } from './routes/model.js'
import { recommendRoutes } from './routes/recommend.js'

const fastify = Fastify({ logger: true })

const start = async () => {
  try {
    const driver = neo4j.driver(
      ENV.NEO4J_URI,
      neo4j.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD)
    )

    const repo = new Neo4jRepository(driver)
    const embeddingService = new EmbeddingService(ENV.EMBEDDING_MODEL)

    const modelStore = new ModelStore()

    fastify.log.info(`[ai-service] Loading embedding model: ${ENV.EMBEDDING_MODEL}`)
    await embeddingService.init()
    fastify.log.info('[ai-service] Embedding model ready')

    if (fs.existsSync('/tmp/model')) {
      try {
        const loadedModel = await tf.loadLayersModel('file:///tmp/model/model.json')
        modelStore.setModel(loadedModel, {
          trainedAt: new Date().toISOString(),
          finalLoss: 0,
          finalAccuracy: 0,
          trainingSamples: 0,
          durationMs: 0,
        })
        fastify.log.info('[ai-service] Neural model loaded from /tmp/model')
      } catch (loadErr) {
        fastify.log.warn({ err: loadErr }, '[ai-service] Failed to load neural model from /tmp/model — starting with untrained status')
      }
    }

    const modelTrainer = new ModelTrainer(
      modelStore,
      repo,
      embeddingService,
      ENV.API_SERVICE_URL,
      ENV.NEURAL_WEIGHT,
      ENV.SEMANTIC_WEIGHT,
    )

    const recommendationService = new RecommendationService(
      modelStore,
      repo,
      ENV.NEURAL_WEIGHT,
      ENV.SEMANTIC_WEIGHT,
      fastify.log,
    )

    const searchService = new SearchService(embeddingService, repo)
    const ragService = new RAGService(embeddingService, repo, ENV.OPENROUTER_API_KEY, ENV.LLM_MODEL)

    fastify.get('/health', async () => ({ status: 'ok', service: 'ai-service' }))

    fastify.get('/ready', async (_request, reply) => {
      const ready = embeddingService.isReady
      return reply.code(ready ? 200 : 503).send({ ready })
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
      modelTrainer,
      modelStore,
    })

    await fastify.register(recommendRoutes, {
      prefix: '/api/v1',
      recommendationService,
    })

    await fastify.listen({ port: ENV.PORT, host: '0.0.0.0' })
    fastify.log.info(`AI Service listening on port ${ENV.PORT}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
