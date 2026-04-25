/**
 * Prebake @xenova/transformers model into node_modules/.cache during Docker build.
 * This eliminates the cold-start download on first container startup.
 */
const { pipeline } = require('@xenova/transformers')

async function main() {
  console.log('[prebake] Downloading embedding model into cache...')
  const modelName = process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2'
  try {
    await pipeline('feature-extraction', modelName)
    console.log('[prebake] Model cached successfully.')
  } catch (err) {
    console.warn('[prebake] Could not download model (may be offline):', err.message)
    // Non-fatal: model will be downloaded at runtime if cache is missing
  }
}

main()
