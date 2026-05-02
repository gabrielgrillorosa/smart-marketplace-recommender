import { parseRecencyAnchorCount, parseRecencyRerankWeight } from './recencyRerankEnv.js'
import { parseProfilePoolingHalfLifeDays, parseProfilePoolingMode } from './profilePoolingEnv.js'

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

function parseBooleanFlag(rawValue: string | undefined, varName: string, defaultValue: boolean): boolean {
  if (rawValue === undefined || rawValue === '') return defaultValue
  if (rawValue === 'false') return false
  if (rawValue === 'true') return true

  console.warn(
    `[ai-service] WARNING: ${varName}="${rawValue}" is invalid. ` +
    `Using default ${defaultValue}. Set ${varName}=true or ${varName}=false.`
  )
  return defaultValue
}

const AUTO_HEAL_MODEL = parseBooleanFlag(process.env.AUTO_HEAL_MODEL, 'AUTO_HEAL_MODEL', true)
const AUTO_SEED_ON_BOOT = parseBooleanFlag(process.env.AUTO_SEED_ON_BOOT, 'AUTO_SEED_ON_BOOT', true)

/** M16 — suppression window for confirmed purchases (Neo4j BOUGHT.order_date, non-demo). */
function parseRecentPurchaseWindowDays(raw: string | undefined): number {
  const n = parseInt(raw ?? '7', 10)
  if (!Number.isFinite(n) || n < 1) {
    console.warn('[ai-service] RECENT_PURCHASE_WINDOW_DAYS invalid or < 1 — using default 7')
    return 7
  }
  return n
}

const RECENT_PURCHASE_WINDOW_DAYS = parseRecentPurchaseWindowDays(process.env.RECENT_PURCHASE_WINDOW_DAYS)
console.info(`[ai-service] RECENT_PURCHASE_WINDOW_DAYS=${RECENT_PURCHASE_WINDOW_DAYS}`)

const RECENCY_RERANK_WEIGHT = parseRecencyRerankWeight(process.env.RECENCY_RERANK_WEIGHT)
const RECENCY_ANCHOR_COUNT = parseRecencyAnchorCount(process.env.RECENCY_ANCHOR_COUNT)
console.info(
  `[ai-service] Recency re-rank: RECENCY_RERANK_WEIGHT=${RECENCY_RERANK_WEIGHT}, RECENCY_ANCHOR_COUNT=${RECENCY_ANCHOR_COUNT}`
)

const PROFILE_POOLING_MODE = parseProfilePoolingMode(process.env.PROFILE_POOLING_MODE)
const PROFILE_POOLING_HALF_LIFE_DAYS = parseProfilePoolingHalfLifeDays(
  process.env.PROFILE_POOLING_HALF_LIFE_DAYS
)
console.info(
  `[ai-service] Profile pooling: PROFILE_POOLING_MODE=${PROFILE_POOLING_MODE}, PROFILE_POOLING_HALF_LIFE_DAYS=${PROFILE_POOLING_HALF_LIFE_DAYS}`
)

const POSTGRES_HOST = process.env.POSTGRES_HOST ?? 'localhost'
const POSTGRES_PORT = parseInt(process.env.POSTGRES_PORT ?? '5432', 10)
const POSTGRES_DB = process.env.POSTGRES_DB ?? 'marketplace'
const POSTGRES_USER = process.env.POSTGRES_USER ?? 'postgres'
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD ?? 'postgres'

export const ENV = Object.freeze({
  NEO4J_URI,
  NEO4J_USER,
  NEO4J_PASSWORD,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY as string | undefined,
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL ?? 'sentence-transformers/all-MiniLM-L6-v2',
  LLM_MODEL: process.env.LLM_MODEL ?? 'meta-llama/llama-3.2-3b-instruct:free',
  API_SERVICE_URL: process.env.API_SERVICE_URL ?? '',
  NEURAL_WEIGHT,
  SEMANTIC_WEIGHT,
  AUTO_HEAL_MODEL,
  AUTO_SEED_ON_BOOT,
  POSTGRES_HOST,
  POSTGRES_PORT,
  POSTGRES_DB,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
  ADMIN_API_KEY: process.env.ADMIN_API_KEY as string | undefined,
  RECENT_PURCHASE_WINDOW_DAYS,
  RECENCY_RERANK_WEIGHT,
  RECENCY_ANCHOR_COUNT,
  PROFILE_POOLING_MODE,
  PROFILE_POOLING_HALF_LIFE_DAYS,
})
