import * as tf from '@tensorflow/tfjs-node'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { fetchTrainingData } from '../services/training-data-fetch.js'
import { buildClientPurchaseTemporalMap } from '../services/training-temporal-map.js'
import { buildTrainingDataset, isM22TrainingDataset, seedFromClientIds } from '../services/training-utils.js'
import { summarizeBinaryMetrics } from '../ml/binaryClassificationMetrics.js'
import {
  buildM22HybridNeuralModel,
  m22InputTensorListFromRows,
  predictM22HybridScores,
  type NeuralArchProfile,
} from '../ml/neuralModelFactory.js'
import { buildM22ManifestFromProducts } from '../ml/m22Manifest.js'
import { DEFAULT_M22_PRICE_BIN_EDGES } from '../ml/itemSparseFeatureExtractor.js'
import { computePrecisionAt5ColdStartCategorySlice, computePrecisionAtKM22 } from '../ml/rankingEval.js'
import type { NeuralHeadKind } from '../types/index.js'
import { ALL_POOLING_MODES, readValLogs, stratifiedTrainValIndices, tryGitHead } from './benchmarkShared.js'
import { buildProfilePoolingRuntimeFromEnv } from '../config/profilePoolingEnv.js'
import type { ProfilePoolingMode } from '../profile/clientProfileAggregation.js'

const EPOCHS = 30
const BATCH_SIZE = 16
const DEFAULT_SCENARIOS: M22BenchmarkScenario[] = ['a', 'ab', 'abc']
const DEFAULT_PROFILES: NeuralArchProfile[] = [
  'baseline',
  'deep64_32',
  'deep128_64',
  'deep128_64_32',
  'deep256',
  'deep512',
]

type M22BenchmarkScenario = 'a' | 'ab' | 'abc'

interface ScenarioStrategy {
  scenario: M22BenchmarkScenario
  structuralEnabled: boolean
  identityEnabled: boolean
}

function createScenarioStrategy(scenario: M22BenchmarkScenario): ScenarioStrategy {
  const map: Record<M22BenchmarkScenario, ScenarioStrategy> = {
    a: { scenario: 'a', structuralEnabled: true, identityEnabled: false },
    ab: { scenario: 'ab', structuralEnabled: true, identityEnabled: false },
    abc: { scenario: 'abc', structuralEnabled: true, identityEnabled: true },
  }
  return map[scenario]
}

function parseScenarioList(value: M22BenchmarkScenario[] | undefined): ScenarioStrategy[] {
  const ids = value ?? DEFAULT_SCENARIOS
  return ids.map((id) => createScenarioStrategy(id))
}

export interface M22BenchmarkRunRow {
  scenario: M22BenchmarkScenario
  profile: NeuralArchProfile
  poolingMode: ProfilePoolingMode
  trainableParams: number
  trainingSamples: number
  trainRows: number
  valRows: number
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
  precisionAt5ColdSlice: number
  precisionAt5ColdClients: number
  precisionAt5GlobalClients: number
}

export interface M22BenchmarkReport {
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
  runs: M22BenchmarkRunRow[]
}

export async function runM22ArchBenchmark(options: {
  apiServiceUrl: string
  neo4jRepo: Neo4jRepository
  scenarios?: M22BenchmarkScenario[]
  profiles?: NeuralArchProfile[]
  poolingModes?: ProfilePoolingMode[]
  valFraction?: number
  gitCwdCandidates?: string[]
}): Promise<M22BenchmarkReport> {
  const strategies = parseScenarioList(options.scenarios)
  const profiles = options.profiles ?? DEFAULT_PROFILES
  const poolingModes = options.poolingModes ?? [buildProfilePoolingRuntimeFromEnv(process.env).mode]
  const valFraction = options.valFraction ?? 0.2
  const gitCandidates = options.gitCwdCandidates ?? [process.cwd(), `${process.cwd()}/../..`]
  const neuralHeadKind: NeuralHeadKind = 'bce_sigmoid'

  const { clients, products, orders } = await fetchTrainingData(options.apiServiceUrl)
  const productsById = new Map(products.map((p) => [p.id, p]))
  const productEmbeddingMap = new Map<string, number[]>()
  for (const { id, embedding } of await options.neo4jRepo.getAllProductEmbeddings()) {
    productEmbeddingMap.set(id, embedding)
  }

  const temporal = buildClientPurchaseTemporalMap(orders)
  const datasetSeed = seedFromClientIds(clients)
  const runs: M22BenchmarkRunRow[] = []

  for (const poolingMode of poolingModes) {
    const poolingRuntime = buildProfilePoolingRuntimeFromEnv({
      ...process.env,
      PROFILE_POOLING_MODE: poolingMode,
    })
    for (const strategy of strategies) {
    if (!strategy.structuralEnabled) {
      throw new Error(`Scenario "${strategy.scenario}" is invalid: structural tower must be enabled`)
    }

    const manifest = buildM22ManifestFromProducts(products, {
      identityEnabled: strategy.identityEnabled,
      priceBinEdges: DEFAULT_M22_PRICE_BIN_EDGES,
    })

    const dataset = buildTrainingDataset(
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
      poolingRuntime,
      { manifest, productsById }
    )
    if (!isM22TrainingDataset(dataset)) {
      throw new Error('Expected M22 dataset rows but received baseline dataset')
    }
    if (dataset.rows.length === 0) {
      throw new Error(`No M22 training samples for scenario "${strategy.scenario}"`)
    }

    const { train, val } = stratifiedTrainValIndices(dataset.labels, valFraction, datasetSeed + 42)
    if (val.length === 0) {
      throw new Error('Validation split is empty — increase data or lower valFraction')
    }

    const rowsTrain = train.map((i) => dataset.rows[i]!)
    const labelsTrain = train.map((i) => dataset.labels[i]!)
    const rowsVal = val.map((i) => dataset.rows[i]!)
    const labelsVal = val.map((i) => dataset.labels[i]!)

    for (const profile of profiles) {
      const model = buildM22HybridNeuralModel(manifest.vocabSizes, 'bce', profile)
      model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] })

      const trainableParams = model.countParams()
      const xTrain = m22InputTensorListFromRows(rowsTrain)
      const yTrain = tf.tensor2d(
        labelsTrain.map((l) => [l]),
        [labelsTrain.length, 1]
      )
      const xVal = m22InputTensorListFromRows(rowsVal)
      const yVal = tf.tensor2d(
        labelsVal.map((l) => [l]),
        [labelsVal.length, 1]
      )

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

      await model.fit(xTrain, yTrain, {
      epochs: EPOCHS,
      batchSize: BATCH_SIZE,
      classWeight: { 0: 1.0, 1: 4.0 },
      validationData: [xVal, yVal],
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
      const valScores = predictM22HybridScores(model, rowsVal, neuralHeadKind)
      const valMetrics = summarizeBinaryMetrics(labelsVal, valScores)
      const precisionAt5 = computePrecisionAtKM22(
        clients,
        orders,
        productEmbeddingMap,
        model,
        5,
        poolingRuntime,
        neuralHeadKind,
        { manifest, productsById }
      )
      const coldEval = computePrecisionAt5ColdStartCategorySlice(
        clients,
        orders,
        productEmbeddingMap,
        model,
        poolingRuntime,
        neuralHeadKind,
        productsById,
        { manifest, productsById }
      )

      xTrain.forEach((t) => t.dispose())
      yTrain.dispose()
      xVal.forEach((t) => t.dispose())
      yVal.dispose()
      model.dispose()

      runs.push({
        scenario: strategy.scenario,
        profile,
        poolingMode: poolingRuntime.mode,
        trainableParams,
        trainingSamples: dataset.rows.length,
        trainRows: rowsTrain.length,
        valRows: rowsVal.length,
        durationMs,
        bestEpoch,
        stoppedEarly,
        finalTrainLoss,
        finalTrainAccuracy,
        finalValLoss,
        finalValAccuracy,
        trainValLossGap: finalValLoss !== null ? finalTrainLoss - finalValLoss : null,
        valMetrics,
        precisionAt5,
        precisionAt5ColdSlice: coldEval.coldSlice,
        precisionAt5ColdClients: coldEval.coldClients,
        precisionAt5GlobalClients: coldEval.globalClients,
      })
    }
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
