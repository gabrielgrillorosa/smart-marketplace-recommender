/**
 * Application entry: ensure `attention_learned` JSON exists before loading `env.ts` (which reads it).
 */
import { ensureAttentionLearnedJsonIfNeeded } from './startup/ensureAttentionLearnedJson.js'

async function main(): Promise<void> {
  await ensureAttentionLearnedJsonIfNeeded()
  const { start } = await import('./index.js')
  await start()
}

void main().catch((err) => {
  console.error('[entry] fatal:', err)
  process.exit(1)
})
