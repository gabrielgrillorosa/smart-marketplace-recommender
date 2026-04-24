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

export const ENV = Object.freeze({
  NEO4J_URI,
  NEO4J_USER,
  NEO4J_PASSWORD,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY as string | undefined,
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  NLP_MODEL: process.env.NLP_MODEL ?? 'sentence-transformers/all-MiniLM-L6-v2',
})
