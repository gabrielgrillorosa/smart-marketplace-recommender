import * as fs from 'node:fs'
import * as path from 'node:path'

export interface AttentionParams {
  w: number[]
  b: number
  lambda?: number
}

export function dotVectors(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`dotVectors: length mismatch (${a.length} vs ${b.length})`)
  }
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!
  return s
}

/** Parse and validate JSON body; embedding dimension checked later against first entry. */
export function parseAttentionParamsJson(text: string, sourceLabel: string): AttentionParams {
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch (e) {
    throw new Error(
      `[ai-service] PROFILE_POOLING_ATTENTION_LEARNED_JSON_PATH: invalid JSON (${sourceLabel}): ${e instanceof Error ? e.message : String(e)}`
    )
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`[ai-service] Attention params JSON must be an object (${sourceLabel}).`)
  }
  const o = raw as Record<string, unknown>
  const wRaw = o.w
  const bRaw = o.b
  if (!Array.isArray(wRaw) || wRaw.length === 0) {
    throw new Error(`[ai-service] Attention params "w" must be a non-empty number array (${sourceLabel}).`)
  }
  const w = wRaw.map((x, i) => {
    const n = Number(x)
    if (!Number.isFinite(n)) {
      throw new Error(`[ai-service] Attention params w[${i}] is not a finite number (${sourceLabel}).`)
    }
    return n
  })
  const b = Number(bRaw)
  if (!Number.isFinite(b)) {
    throw new Error(`[ai-service] Attention params "b" must be a finite number (${sourceLabel}).`)
  }
  let lambda: number | undefined
  if (o.lambda !== undefined && o.lambda !== null) {
    lambda = Number(o.lambda)
    if (!Number.isFinite(lambda) || lambda < 0) {
      throw new Error(`[ai-service] Attention params "lambda" must be a finite number >= 0 (${sourceLabel}).`)
    }
  }
  return { w, b, lambda }
}

export function loadAttentionParamsFromResolvedPath(resolvedPath: string): AttentionParams {
  const abs = path.resolve(resolvedPath)
  if (!fs.existsSync(abs)) {
    throw new Error(
      `[ai-service] PROFILE_POOLING_ATTENTION_LEARNED_JSON_PATH: file not found: ${JSON.stringify(abs)}`
    )
  }
  const text = fs.readFileSync(abs, 'utf8')
  return parseAttentionParamsJson(text, abs)
}
