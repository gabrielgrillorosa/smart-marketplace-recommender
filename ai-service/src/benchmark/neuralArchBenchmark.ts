import * as tf from '@tensorflow/tfjs-node'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { fetchTrainingData } from '../services/training-data-fetch.js'
import { buildTrainingDataset, seedFromClientIds } from '../services/training-utils.js'
import { buildClientPurchaseTemporalMap } from '../services/training-temporal-map.js'
import { buildNeuralModel, type NeuralArchProfile } from '../ml/neuralModelFactory.js'
import { summarizeBinaryMetrics } from '../ml/binaryClassificationMetrics.js'
import { computePrecisionAtK } from '../ml/rankingEval.js'
import { ALL_POOLING_MODES, readValLogs, stratifiedTrainValIndices, tryGitHead } from './benchmarkShared.js'
import { buildProfilePoolingRuntimeFromEnv } from '../config/profilePoolingEnv.js'
import type { ProfilePoolingMode } from '../profile/clientProfileAggregation.js'

const EPOCHS = 30
const BATCH_SIZE = 16

function predictProbsSync(model: tf.LayersModel, xs: tf.Tensor2D): number[] {
  return tf.tidy(() => {
    const pred = model.predict(xs) as tf.Tensor
    return Array.from(pred.dataSync())
  })
}

export interface BenchmarkRunRow {
  profile: NeuralArchProfile
  poolingMode: ProfilePoolingMode
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
    poolingMode: ProfilePoolingMode
    poolingHalfLifeDays: number
    poolingModesTested: ProfilePoolingMode[]
  }
  runs: BenchmarkRunRow[]
}

const DEFAULT_PROFILES: NeuralArchProfile[] = ['baseline', 'deep64_32', 'deep128_64', 'deep256', 'deep512']

export async function runNeuralArchBenchmark(options: {
  apiServiceUrl: string
  neo4jRepo: Neo4jRepository
  profiles?: NeuralArchProfile[]
  poolingModes?: ProfilePoolingMode[]
  valFraction?: number
  gitCwdCandidates?: string[]
}): Promise<BenchmarkReport> {
  const profiles = options.profiles ?? DEFAULT_PROFILES
  const poolingModes = options.poolingModes ?? [buildProfilePoolingRuntimeFromEnv(process.env).mode]
  const valFraction = options.valFraction ?? 0.2
  const gitCandidates = options.gitCwdCandidates ?? [process.cwd(), `${process.cwd()}/../..`]

  const { clients, products, orders } = await fetchTrainingData(options.apiServiceUrl)
  const productEmbeddingMap = new Map<string, number[]>()
  for (const { id, embedding } of await options.neo4jRepo.getAllProductEmbeddings()) {
    productEmbeddingMap.set(id, embedding)
  }

  const temporal = buildClientPurchaseTemporalMap(orders)

  const datasetSeed = seedFromClientIds(clients)
  const runs: BenchmarkRunRow[] = []
  for (const poolingMode of poolingModes) {
    const poolingRuntime = buildProfilePoolingRuntimeFromEnv({
      ...process.env,
      PROFILE_POOLING_MODE: poolingMode,
    })
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
      poolingRuntime
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
      precisionAt5 = computePrecisionAtK(clients, orders, productEmbeddingMap, model, 5, poolingRuntime)
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
      poolingMode: poolingRuntime.mode,
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
      poolingMode: poolingModes[0] ?? ALL_POOLING_MODES[0],
      poolingHalfLifeDays: buildProfilePoolingRuntimeFromEnv({
        ...process.env,
        PROFILE_POOLING_MODE: poolingModes[0] ?? ALL_POOLING_MODES[0],
      }).halfLifeDays,
      poolingModesTested: poolingModes,
    },
    runs,
  }
}
