import * as fs from 'node:fs'
import * as path from 'node:path'
import neo4j from 'neo4j-driver'
import type { AttentionParams } from '../profile/attentionParamsJson.js'
import { parseAttentionParamsJson } from '../profile/attentionParamsJson.js'
import { buildAttentionPoolingBinaryDataset } from '../ml/attentionPoolingTrainDataset.js'
import { trainAttentionPoolingDense } from '../ml/trainAttentionPoolingWeights.js'
import { fetchTrainingData } from './training-data-fetch.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { seedFromClientIds } from './training-utils.js'
import type { ClientDTO } from './training-utils.js'

const DEFAULT_PLACEHOLDER_DIM = 384

export type AttentionJsonGenerateKind = 'trained' | 'placeholder' | 'skipped_valid'

export interface GenerateAttentionLearnedJsonResult {
  kind: AttentionJsonGenerateKind
  outPath: string
  sampleCount?: number
  embeddingDim?: number
  trainLoss?: number
  valLoss?: number | null
}

export async function probeEmbeddingDim(neo4jRepo: Neo4jRepository): Promise<number> {
  const rows = await neo4jRepo.getAllProductEmbeddings()
  const first = rows[0]
  if (first && first.embedding.length > 0) return first.embedding.length
  return DEFAULT_PLACEHOLDER_DIM
}

export function writeAttentionParamsJson(outPath: string, params: AttentionParams): void {
  const abs = path.resolve(outPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, JSON.stringify(params, null, 2), 'utf8')
}

export function writePlaceholderAttentionParams(outPath: string, embeddingDim: number): AttentionParams {
  const params: AttentionParams = {
    w: new Array(embeddingDim).fill(0),
    b: 0,
    lambda: 1,
  }
  writeAttentionParamsJson(outPath, params)
  return params
}

export function isValidAttentionParamsFile(absPath: string): boolean {
  if (!fs.existsSync(absPath)) return false
  try {
    const text = fs.readFileSync(absPath, 'utf8')
    const p = parseAttentionParamsJson(text, absPath)
    return p.w.length > 0
  } catch {
    return false
  }
}

export interface GenerateAttentionLearnedJsonOptions {
  apiServiceUrl: string
  neo4jUri: string
  neo4jUser: string
  neo4jPassword: string
  outPath: string
  negativesPerPositive?: number
  /** When true, skip work if file already valid. */
  skipIfValid?: boolean
  logger?: { info: (m: string) => void; warn: (m: string) => void; error?: (m: string) => void }
}

export async function generateAttentionLearnedJson(
  opts: GenerateAttentionLearnedJsonOptions
): Promise<GenerateAttentionLearnedJsonResult> {
  const outPath = path.resolve(opts.outPath)
  const log = opts.logger ?? console

  if (opts.skipIfValid !== false && isValidAttentionParamsFile(outPath)) {
    log.info?.(`[attention-json] valid file already present — ${outPath}`)
    return { kind: 'skipped_valid', outPath }
  }

  const negativesPerPositive = opts.negativesPerPositive ?? 2

  if (!opts.neo4jUri.trim() || !opts.neo4jUser.trim()) {
    log.warn?.('[attention-json] Neo4j env incomplete — writing 384-d placeholder')
    writePlaceholderAttentionParams(outPath, DEFAULT_PLACEHOLDER_DIM)
    return { kind: 'placeholder', outPath, embeddingDim: DEFAULT_PLACEHOLDER_DIM }
  }

  const driver = neo4j.driver(opts.neo4jUri, neo4j.auth.basic(opts.neo4jUser, opts.neo4jPassword))
  const repo = new Neo4jRepository(driver)
  try {
    const dim = await probeEmbeddingDim(repo)

    if (!opts.apiServiceUrl.trim()) {
      log.warn?.('[attention-json] API_SERVICE_URL empty — writing placeholder attention JSON')
      writePlaceholderAttentionParams(outPath, dim)
      return { kind: 'placeholder', outPath, embeddingDim: dim }
    }

    let orders
    let clients: ClientDTO[]
    try {
      ;({ clients, orders } = await fetchTrainingData(opts.apiServiceUrl))
    } catch (e) {
      log.warn?.(
        `[attention-json] fetchTrainingData failed (${e instanceof Error ? e.message : String(e)}) — placeholder`
      )
      writePlaceholderAttentionParams(outPath, dim)
      return { kind: 'placeholder', outPath, embeddingDim: dim }
    }

    const productEmbeddingMap = new Map<string, number[]>()
    for (const { id, embedding } of await repo.getAllProductEmbeddings()) {
      productEmbeddingMap.set(id, embedding)
    }

    const rows = buildAttentionPoolingBinaryDataset(orders, productEmbeddingMap, {
      negativesPerPositive,
      seed: seedFromClientIds(clients),
    })

    if (rows.length === 0) {
      log.warn?.('[attention-json] no attention train rows — writing placeholder')
      writePlaceholderAttentionParams(outPath, dim)
      return { kind: 'placeholder', outPath, embeddingDim: dim }
    }

    const trained = await trainAttentionPoolingDense(rows, {
      lambdaInference: 1.0,
    })
    writeAttentionParamsJson(outPath, trained.params)
    log.info?.(
      `[attention-json] wrote trained params (${trained.sampleCount} rows, dim=${trained.embeddingDim}, loss=${trained.trainLoss.toFixed(4)}) → ${outPath}`
    )
    return {
      kind: 'trained',
      outPath,
      sampleCount: trained.sampleCount,
      embeddingDim: trained.embeddingDim,
      trainLoss: trained.trainLoss,
      valLoss: trained.valLoss,
    }
  } finally {
    await driver.close()
  }
}
