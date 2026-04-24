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
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  NLP_MODEL: process.env.NLP_MODEL ?? 'sentence-transformers/all-MiniLM-L6-v2',
  API_SERVICE_URL: process.env.API_SERVICE_URL ?? '',
  NEURAL_WEIGHT,
  SEMANTIC_WEIGHT,
})
