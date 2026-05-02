import type { NeuralHeadKind } from '../types/index.js'

/** Sidecar filename next to `model.json` under a versioned save directory. */
export const NEURAL_HEAD_MANIFEST_FILENAME = 'neural-head.json'

export function parseNeuralHeadManifestJson(text: string): NeuralHeadKind {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error(
      `neural-head.json: invalid JSON (${e instanceof Error ? e.message : String(e)})`
    )
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('neural-head.json: expected a JSON object')
  }
  const head = (parsed as { head?: unknown }).head
  if (head === 'bce_sigmoid' || head === 'ranking_linear') return head
  throw new Error(`neural-head.json: unknown head ${JSON.stringify(head)} — expected bce_sigmoid | ranking_linear`)
}
