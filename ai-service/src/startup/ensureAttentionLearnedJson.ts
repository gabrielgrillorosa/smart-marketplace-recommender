/**
 * Runs before `config/env.js` is imported so `PROFILE_POOLING_MODE=attention_learned` can load a valid JSON.
 * Uses only `process.env` (no ENV import).
 */
import { parseProfilePoolingMode, resolveAttentionLearnedJsonPath } from '../config/profilePoolingEnv.js'
import { generateAttentionLearnedJson } from '../services/attentionLearnedJsonGenerator.js'

export async function ensureAttentionLearnedJsonIfNeeded(): Promise<void> {
  const mode = parseProfilePoolingMode(process.env.PROFILE_POOLING_MODE)
  if (mode !== 'attention_learned') {
    return
  }

  const outPath = resolveAttentionLearnedJsonPath(process.env)
  await generateAttentionLearnedJson({
    apiServiceUrl: process.env.API_SERVICE_URL ?? '',
    neo4jUri: process.env.NEO4J_URI ?? '',
    neo4jUser: process.env.NEO4J_USER ?? '',
    neo4jPassword: process.env.NEO4J_PASSWORD ?? '',
    outPath,
    negativesPerPositive: parseInt(process.env.ATTENTION_LEARNED_NEGATIVES_PER_POSITIVE ?? '2', 10) || 2,
    skipIfValid: true,
    logger: console,
  })
}
