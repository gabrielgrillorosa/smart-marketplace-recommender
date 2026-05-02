import * as tf from '@tensorflow/tfjs-node'
import { execSync } from 'node:child_process'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { fetchTrainingData } from '../services/training-data-fetch.js'
import { buildTrainingDataset, seedFromClientIds } from '../services/training-utils.js'
import { buildClientPurchaseTemporalMap } from '../services/training-temporal-map.js'
import { buildNeuralModel, type NeuralArchProfile } from '../ml/neuralModelFactory.js'
import { summarizeBinaryMetrics } from '../ml/binaryClassificationMetrics.js'
import { computePrecisionAtK } from '../ml/rankingEval.js'

const EPOCHS = 30
const BATCH_SIZE = 16

function lcgNext(state: number): number {
  return (state * 1664525 + 1013904223) & 0xffffffff
}

function shuffleInPlace(arr: number[], seed: number): void {
  let state = seed
  for (let i = arr.length - 1; i > 0; i--) {
    state = lcgNext(state)
    const j = Math.abs(state) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

function stratifiedTrainValIndices(
  labels: number[],
  valFraction: number,
  seed: number
): { train: number[]; val: number[] } {
  const idx0: number[] = []
  const idx1: number[] = []
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === 0) idx0.push(i)
    else idx1.push(i)
  }

  function splitClass(classIdx: number[], s: number): { train: number[]; val: number[] } {
    if (classIdx.length === 0) return { train: [], val: [] }
    const sh = [...classIdx]
    shuffleInPlace(sh, s)
    if (sh.length === 1) return { train: [...sh], val: [] }
    const nVal = Math.max(1, Math.min(sh.length - 1, Math.round(sh.length * valFraction)))
    return { val: sh.slice(0, nVal), train: sh.slice(nVal) }
  }

  const a = splitClass(idx0, seed)
  const b = splitClass(idx1, seed + 1_000_003)
  return {
    train: [...a.train, ...b.train],
    val: [...a.val, ...b.val],
  }
}

function tryGitHead(candidates: string[]): string | null {
  for (const cwd of candidates) {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8', cwd }).trim()
    } catch {
      /* try next */
    }
  }
  return null
}

function predictProbsSync(model: tf.LayersModel, xs: tf.Tensor2D): number[] {
  return tf.tidy(() => {
    const pred = model.predict(xs) as tf.Tensor
    return Array.from(pred.dataSync())
  })
}

function readValLogs(logs: tf.Logs | undefined): { valLoss: number | undefined; valAcc: number | undefined } {
  if (!logs) return { valLoss: undefined, valAcc: undefined }
  const valLoss = typeof logs.val_loss === 'number' ? logs.val_loss : undefined
  const valAccRaw = logs.val_acc ?? logs.val_accuracy
  const valAcc = typeof valAccRaw === 'number' ? valAccRaw : undefined
  return { valLoss, valAcc }
}

export interface BenchmarkRunRow {
  profile: NeuralArchProfile
  trainableParams: number
  trainingSamples: number
  trainRows: number
  valRows: number
  paramSampleRatio: number
  durationMs: number
  bestEpoch: number
  stoppedEarly: boolean
  finalTrainLoss: number
  finalTrainAccuracy: number
  finalValLoss: number | null
  finalValAccuracy: number | null
  trainValLossGap: number | null
  valMetrics: ReturnType<typeof summarizeBinaryMetrics> | null
  precisionAt5: number
  notes: string[]
}

export interface BenchmarkReport {
  generatedAt: string
  gitCommit: string | null
  apiServiceUrl: string
  dataCounts: { clients: number; products: number; orders: number }
  hyperparams: {
    epochs: number
    batchSize: number
    classWeight: Record<string, number>
    valFraction: number
  }
  runs: BenchmarkRunRow[]
}

const DEFAULT_PROFILES: NeuralArchProfile[] = ['baseline', 'deep64_32', 'deep128_64']

export async function runNeuralArchBenchmark(options: {
  apiServiceUrl: string
  neo4jRepo: Neo4jRepository
  profiles?: NeuralArchProfile[]
  valFraction?: number
  gitCwdCandidates?: string[]
}): Promise<BenchmarkReport> {
  const profiles = options.profiles ?? DEFAULT_PROFILES
  const valFraction = options.valFraction ?? 0.2
  const gitCandidates = options.gitCwdCandidates ?? [process.cwd(), `${process.cwd()}/../..`]

  const { clients, products, orders } = await fetchTrainingData(options.apiServiceUrl)
  const productEmbeddingMap = new Map<string, number[]>()
  for (const { id, embedding } of await options.neo4jRepo.getAllProductEmbeddings()) {
    productEmbeddingMap.set(id, embedding)
  }

  const temporal = buildClientPurchaseTemporalMap(orders)

  const datasetSeed = seedFromClientIds(clients)
  const { inputVectors, labels } = buildTrainingDataset(
    clients,
    temporal.clientPurchasedProducts,
    productEmbeddingMap,
    products,
    {
      negativeSamplingRatio: 4,
      seed: datasetSeed,
      useClassWeight: true,
    },
    temporal,
    { mode: 'mean', halfLifeDays: 30 }
  )

  if (inputVectors.length === 0) {
    throw new Error('No training samples — cannot benchmark')
  }
  if (inputVectors[0]?.length !== 768) {
    throw new Error(`Expected input dimension 768, got ${inputVectors[0]?.length ?? 0}`)
  }

  const { train, val } = stratifiedTrainValIndices(labels, valFraction, datasetSeed + 42)
  if (val.length === 0) {
    throw new Error('Validation split is empty — increase data or lower valFraction')
  }

  const valLabels = val.map((i) => labels[i]!)
  const nValPos = valLabels.filter((y) => y === 1).length
  const nValNeg = valLabels.length - nValPos

  const runs: BenchmarkRunRow[] = []

  for (const profile of profiles) {
    const notes: string[] = []
    if (nValPos === 0 || nValNeg === 0) {
      notes.push('Validation set missing a class — AUC metrics omitted')
    }

    const model = buildNeuralModel(profile)
    const trainableParams = model.countParams()

    const trainIdx = train
    const xsTrain = tf.tensor2d(
      trainIdx.map((i) => inputVectors[i]!),
      [trainIdx.length, 768]
    )
    const ysTrain = tf.tensor2d(
      trainIdx.map((i) => [labels[i]!]),
      [trainIdx.length, 1]
    )

    const xsVal = tf.tensor2d(
      val.map((i) => inputVectors[i]!),
      [val.length, 768]
    )
    const ysVal = tf.tensor2d(
      val.map((i) => [labels[i]!]),
      [val.length, 1]
    )

    model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] })

    let bestEpoch = 1
    let bestValLoss = Infinity
    let patienceCounter = 0
    const PATIENCE = 5
    const LOSS_MIN_DELTA = 1e-4
    let finalTrainLoss = 0
    let finalTrainAccuracy = 0
    let finalValLoss: number | null = null
    let finalValAccuracy: number | null = null
    let stoppedEarly = false
    const t0 = Date.now()

    await model.fit(xsTrain, ysTrain, {
      epochs: EPOCHS,
      batchSize: BATCH_SIZE,
      classWeight: { 0: 1.0, 1: 4.0 },
      validationData: [xsVal, ysVal],
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          const trainLoss = logs?.loss ?? 0
          const trainAcc = logs?.acc ?? logs?.accuracy ?? 0
          const { valLoss, valAcc } = readValLogs(logs)
          finalTrainLoss = trainLoss
          finalTrainAccuracy = trainAcc
          if (typeof valLoss === 'number' && Number.isFinite(valLoss)) {
            finalValLoss = valLoss
            if (typeof valAcc === 'number') finalValAccuracy = valAcc
            if (valLoss < bestValLoss - LOSS_MIN_DELTA) {
              bestValLoss = valLoss
              bestEpoch = epoch + 1
              patienceCounter = 0
            } else {
              patienceCounter++
              if (patienceCounter >= PATIENCE) {
                stoppedEarly = true
                model.stopTraining = true
              }
            }
          }
        },
      },
    })

    const durationMs = Date.now() - t0

    let valMetrics: ReturnType<typeof summarizeBinaryMetrics> | null = null
    if (nValPos > 0 && nValNeg > 0) {
      const probs = predictProbsSync(model, xsVal)
      valMetrics = summarizeBinaryMetrics(valLabels, probs)
    }

    let precisionAt5 = 0
    try {
      precisionAt5 = computePrecisionAtK(clients, orders, productEmbeddingMap, model)
    } catch (e) {
      notes.push(`precisionAt5 failed: ${e instanceof Error ? e.message : String(e)}`)
    }

    xsTrain.dispose()
    ysTrain.dispose()
    xsVal.dispose()
    ysVal.dispose()
    model.dispose()

    const trainValLossGap = finalValLoss !== null ? finalTrainLoss - finalValLoss : null

    runs.push({
      profile,
      trainableParams,
      trainingSamples: inputVectors.length,
      trainRows: trainIdx.length,
      valRows: val.length,
      paramSampleRatio: trainableParams / inputVectors.length,
      durationMs,
      bestEpoch,
      stoppedEarly,
      finalTrainLoss,
      finalTrainAccuracy,
      finalValLoss,
      finalValAccuracy,
      trainValLossGap,
      valMetrics,
      precisionAt5,
      notes,
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    gitCommit: tryGitHead(gitCandidates),
    apiServiceUrl: options.apiServiceUrl,
    dataCounts: {
      clients: clients.length,
      products: products.length,
      orders: orders.length,
    },
    hyperparams: {
      epochs: EPOCHS,
      batchSize: BATCH_SIZE,
      classWeight: { 0: 1, 1: 4 },
      valFraction,
    },
    runs,
  }
}
