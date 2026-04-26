const missingVars: string[] = []

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    missingVars.push(name)
    return ''
  }
  return value
}

const NEO4J_URI = requireEnv('NEO4J_URI')
const NEO4J_USER = requireEnv('NEO4J_USER')
const NEO4J_PASSWORD = requireEnv('NEO4J_PASSWORD')

if (missingVars.length > 0) {
  console.warn(
    `[ai-service] WARNING: Missing environment variables: ${missingVars.join(', ')}. ` +
    'Endpoints that use Neo4j will return 503 at runtime.'
  )
}

if (!process.env.API_SERVICE_URL) {
  console.warn('[ai-service] WARNING: API_SERVICE_URL not set. POST /api/v1/model/train will return 503.')
}

if (!process.env.ADMIN_API_KEY) {
  console.warn('[ai-service] WARNING: ADMIN_API_KEY not set — admin endpoints unprotected')
}

const NEURAL_WEIGHT = parseFloat(process.env.NEURAL_WEIGHT ?? '0.6')
const SEMANTIC_WEIGHT = parseFloat(process.env.SEMANTIC_WEIGHT ?? '0.4')

console.info(`[ai-service] Hybrid weights: neural=${NEURAL_WEIGHT}, semantic=${SEMANTIC_WEIGHT}`)

if (Math.abs(NEURAL_WEIGHT + SEMANTIC_WEIGHT - 1.0) > 1e-9) {
  console.warn('[ai-service] Warning: NEURAL_WEIGHT + SEMANTIC_WEIGHT != 1.0 — scores may not sum to 1')
}

export const ENV = Object.freeze({
  NEO4J_URI,
  NEO4J_USER,
  NEO4J_PASSWORD,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY as string | undefined,
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  // Model for local HuggingFace embeddings (sentence-transformers, runs inside the container)
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL ?? 'sentence-transformers/all-MiniLM-L6-v2',
  // Model for OpenRouter LLM inference (RAG chat)
  LLM_MODEL: process.env.LLM_MODEL ?? 'meta-llama/llama-3.2-3b-instruct:free',
  API_SERVICE_URL: process.env.API_SERVICE_URL ?? '',
  NEURAL_WEIGHT,
  SEMANTIC_WEIGHT,
  ADMIN_API_KEY: process.env.ADMIN_API_KEY as string | undefined,
})
