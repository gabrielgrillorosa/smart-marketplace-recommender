import Fastify from 'fastify'
import neo4j from 'neo4j-driver'
import { ENV } from './config/env.js'
import { Neo4jRepository } from './repositories/Neo4jRepository.js'
import { EmbeddingService } from './services/EmbeddingService.js'
import { SearchService } from './services/SearchService.js'
import { RAGService } from './services/RAGService.js'
import { embeddingsRoutes } from './routes/embeddings.js'
import { searchRoutes } from './routes/search.js'
import { ragRoutes } from './routes/rag.js'

const fastify = Fastify({ logger: true })

const start = async () => {
  try {
    const driver = neo4j.driver(
      ENV.NEO4J_URI,
      neo4j.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD)
    )

    const repo = new Neo4jRepository(driver)
    const embeddingService = new EmbeddingService(ENV.NLP_MODEL)

    fastify.log.info(`[ai-service] Loading embedding model: ${ENV.NLP_MODEL}`)
    await embeddingService.init()
    fastify.log.info('[ai-service] Embedding model ready')

    const searchService = new SearchService(embeddingService, repo)
    const ragService = new RAGService(embeddingService, repo, ENV.OPENROUTER_API_KEY, ENV.NLP_MODEL)

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

    await fastify.listen({ port: ENV.PORT, host: '0.0.0.0' })
    fastify.log.info(`AI Service listening on port ${ENV.PORT}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
