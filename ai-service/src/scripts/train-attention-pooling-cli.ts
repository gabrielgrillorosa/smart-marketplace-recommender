/**
 * Offline CLI: train Dense(1) profile-attention head and write JSON for PROFILE_POOLING_ATTENTION_LEARNED_JSON_PATH.
 *
 * Does **not** import `src/config/env.ts` (avoids PROFILE_POOLING_MODE=attention_learned bootstrap without JSON).
 *
 * Usage (API + Neo4j snapshot, same sources as neural training):
 *   PROFILE_POOLING_MODE=mean API_SERVICE_URL=... NEO4J_URI=... NEO4J_USER=... NEO4J_PASSWORD=... \
 *     npx ts-node src/scripts/train-attention-pooling-cli.ts --out ./config/attention-learned.json
 *
 * NDJSON (`{ "embedding": number[], "label": 0|1 }` per line) or a single JSON array of such objects:
 *   npx ts-node src/scripts/train-attention-pooling-cli.ts --from-ndjson ./rows.ndjson --out ./out.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import neo4j from 'neo4j-driver'
import { buildAttentionPoolingBinaryDataset } from '../ml/attentionPoolingTrainDataset.js'
import { trainAttentionPoolingDense } from '../ml/trainAttentionPoolingWeights.js'
import { fetchTrainingData } from '../services/training-data-fetch.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { seedFromClientIds } from '../services/training-utils.js'
import type { ClientDTO } from '../services/training-utils.js'

function parseArgs(argv: string[]): {
  out?: string
  fromNdjson?: string
  negativesPerPositive: number
  maxEpochs: number
  batchSize: number
  validationSplit: number
  l2: number
  lambdaOut: number
  learningRate: number
  earlyStopPatience: number
} {
  let out: string | undefined
  let fromNdjson: string | undefined
  let negativesPerPositive = 2
  let maxEpochs = 40
  let batchSize = 32
  let validationSplit = 0.2
  let l2 = 1e-4
  let lambdaOut = 1.0
  let learningRate = 0.01
  let earlyStopPatience = 5

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out' && argv[i + 1]) out = argv[++i]
    else if (a === '--from-ndjson' && argv[i + 1]) fromNdjson = argv[++i]
    else if (a === '--negatives-per-positive' && argv[i + 1]) negativesPerPositive = parseInt(argv[++i]!, 10)
    else if (a === '--epochs' && argv[i + 1]) maxEpochs = parseInt(argv[++i]!, 10)
    else if (a === '--batch-size' && argv[i + 1]) batchSize = parseInt(argv[++i]!, 10)
    else if (a === '--validation-split' && argv[i + 1]) validationSplit = parseFloat(argv[++i]!)
    else if (a === '--l2' && argv[i + 1]) l2 = parseFloat(argv[++i]!)
    else if (a === '--lambda' && argv[i + 1]) lambdaOut = parseFloat(argv[++i]!)
    else if (a === '--lr' && argv[i + 1]) learningRate = parseFloat(argv[++i]!)
    else if (a === '--early-stop-patience' && argv[i + 1]) earlyStopPatience = parseInt(argv[++i]!, 10)
  }

  if (!Number.isFinite(negativesPerPositive) || negativesPerPositive < 0) negativesPerPositive = 2
  if (!Number.isFinite(maxEpochs) || maxEpochs < 1) maxEpochs = 40
  if (!Number.isFinite(batchSize) || batchSize < 1) batchSize = 32
  if (!Number.isFinite(validationSplit) || validationSplit < 0 || validationSplit >= 1) validationSplit = 0.2
  if (!Number.isFinite(l2) || l2 < 0) l2 = 1e-4
  if (!Number.isFinite(lambdaOut) || lambdaOut < 0) lambdaOut = 1.0
  if (!Number.isFinite(learningRate) || learningRate <= 0) learningRate = 0.01
  if (!Number.isFinite(earlyStopPatience) || earlyStopPatience < 1) earlyStopPatience = 5

  return {
    out,
    fromNdjson,
    negativesPerPositive,
    maxEpochs,
    batchSize,
    validationSplit,
    l2,
    lambdaOut,
    learningRate,
    earlyStopPatience,
  }
}

function loadRowsFromNdjson(path: string): { embedding: number[]; label: number }[] {
  const text = readFileSync(path, 'utf8').trim()
  if (!text) return []

  const parseOne = (raw: string): { embedding: number[]; label: number } => {
    const o = JSON.parse(raw) as { embedding?: unknown; label?: unknown }
    if (!Array.isArray(o.embedding) || o.embedding.length === 0) {
      throw new Error('[train-attention-pooling] each row needs non-empty "embedding" array')
    }
    const embedding = o.embedding.map((x, i) => {
      const n = Number(x)
      if (!Number.isFinite(n)) throw new Error(`[train-attention-pooling] embedding[${i}] not finite`)
      return n
    })
    const label = Number(o.label)
    if (label !== 0 && label !== 1) {
      throw new Error('[train-attention-pooling] label must be 0 or 1')
    }
    return { embedding, label }
  }

  if (text.startsWith('[')) {
    const arr = JSON.parse(text) as unknown
    if (!Array.isArray(arr)) throw new Error('[train-attention-pooling] JSON array expected')
    return arr.map((row, i) => {
      try {
        return parseOne(JSON.stringify(row))
      } catch (e) {
        throw new Error(`[train-attention-pooling] row ${i}: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'))
  return lines.map((line, i) => {
    try {
      return parseOne(line)
    } catch (e) {
      throw new Error(`[train-attention-pooling] line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
}

async function loadRowsFromApi(negativesPerPositive: number): Promise<{ embedding: number[]; label: number }[]> {
  const apiUrl = process.env.API_SERVICE_URL?.trim() ?? ''
  const neoUri = process.env.NEO4J_URI?.trim() ?? ''
  const neoUser = process.env.NEO4J_USER?.trim() ?? ''
  const neoPass = process.env.NEO4J_PASSWORD?.trim() ?? ''
  if (!apiUrl) {
    throw new Error('API_SERVICE_URL is required unless --from-ndjson is set')
  }
  if (!neoUri || !neoUser || !neoPass) {
    throw new Error('NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD are required for API-backed dataset')
  }

  const { clients, orders } = await fetchTrainingData(apiUrl)
  const driver = neo4j.driver(neoUri, neo4j.auth.basic(neoUser, neoPass))
  const repo = new Neo4jRepository(driver)
  try {
    const productEmbeddingMap = new Map<string, number[]>()
    for (const { id, embedding } of await repo.getAllProductEmbeddings()) {
      productEmbeddingMap.set(id, embedding)
    }
    const seed = seedFromClientIds(clients as ClientDTO[])
    return buildAttentionPoolingBinaryDataset(orders, productEmbeddingMap, {
      negativesPerPositive: Math.max(0, negativesPerPositive),
      seed,
    })
  } finally {
    await driver.close()
  }
}

function printAndWrite(
  outPath: string,
  r: Awaited<ReturnType<typeof trainAttentionPoolingDense>>
): void {
  const json = JSON.stringify(r.params, null, 2)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, json, 'utf8')
  console.info(
    `[train-attention-pooling] wrote ${outPath} (dim=${r.embeddingDim}, samples=${r.sampleCount}, ` +
      `epochs=${r.epochsCompleted}, trainLoss=${r.trainLoss.toFixed(4)}, valLoss=${r.valLoss === null ? 'n/a' : r.valLoss.toFixed(4)})`
  )
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  if (!args.out) {
    console.error(
      'Usage: ts-node src/scripts/train-attention-pooling-cli.ts --out <attention.json> [--from-ndjson path]\n' +
        'Default: build rows from API + Neo4j (same snapshot as ModelTrainer).'
    )
    process.exit(1)
  }

  const rows = args.fromNdjson ? loadRowsFromNdjson(args.fromNdjson) : await loadRowsFromApi(args.negativesPerPositive)

  if (rows.length === 0) {
    throw new Error('[train-attention-pooling] no training rows (check orders / embeddings / ndjson file)')
  }

  const trained = await trainAttentionPoolingDense(rows, {
    l2: args.l2,
    maxEpochs: args.maxEpochs,
    batchSize: args.batchSize,
    validationSplit: args.validationSplit,
    learningRate: args.learningRate,
    earlyStopPatience: args.earlyStopPatience,
    lambdaInference: args.lambdaOut,
  })
  printAndWrite(args.out, trained)
}

main().catch((e) => {
  console.error('[train-attention-pooling]', e instanceof Error ? e.message : e)
  process.exit(1)
})
