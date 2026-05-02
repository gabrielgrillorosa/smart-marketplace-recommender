/**
 * Run during Docker build (machine needs HTTPS access to Hugging Face once).
 * Cache location: set HF_HOME / HUGGINGFACE_HUB_CACHE in Dockerfile so COPY matches disk layout.
 */
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers'

async function main(): Promise<void> {
  const model = process.env.EMBEDDING_MODEL ?? 'sentence-transformers/all-MiniLM-L6-v2'
  console.info(`[prewarm-embedding] Downloading / verifying model: ${model}`)
  const embeddings = new HuggingFaceTransformersEmbeddings({ model })
  await embeddings.embedQuery('')
  console.info('[prewarm-embedding] Model cache ready.')
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('[prewarm-embedding] Failed:', msg)
  process.exit(1)
})
