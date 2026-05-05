import * as tf from '@tensorflow/tfjs-node'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { fetchTrainingData } from '../services/training-data-fetch.js'
import { buildClientPurchaseTemporalMap } from '../services/training-temporal-map.js'
import {
  buildTrainingDataset,
  isM22TrainingDataset,
  seedFromClientIds,
  m22BceLabelsToPairwiseRows,
  type NegativeSamplingDatasetMetadata,
} from '../services/training-utils.js'
import { summarizeBinaryMetrics } from '../ml/binaryClassificationMetrics.js'
import {
  buildM22HybridNeuralModel,
  m22InputTensorListFromRows,
  predictM22HybridScores,
  type NeuralArchProfile,
} from '../ml/neuralModelFactory.js'
import { buildM22ManifestFromProducts } from '../ml/m22Manifest.js'
import { DEFAULT_M22_PRICE_BIN_EDGES } from '../ml/itemSparseFeatureExtractor.js'
import { computeRankingEvalM22, type RankingEvalReport } from '../ml/rankingEval.js'
import type { NeuralHeadKind, NeuralLossMode } from '../types/index.js'
import {
  assertNegativeSamplingEnvOrThrow,
  parseNegativeSamplingEnv,
  type NegativeSamplingEnv,
  type NegativeSamplingMode,
} from '../config/negativeSamplingEnv.js'
import { readValLogs, stratifiedTrainValIndices, tryGitHead } from './benchmarkShared.js'
import { buildProfilePoolingRuntimeFromEnv } from '../config/profilePoolingEnv.js'
import type { ProfilePoolingMode } from '../profile/clientProfileAggregation.js'
import { neuralLossModeToHeadKind } from '../ml/neuralHead.js'

/**
 * M23 — T23-7: Benchmark harness comparing `legacy` vs `stratified`
 * negative sampling under the same M22 protocol (same dataset, same
 * trainer hyperparams, same eval split). Each `(samplingMode, scenario)`
 * combination is repeated for at least `M23_BENCHMARK_RUNS` runs
 * (minimum 2, enforced by `parseNegativeSamplingEnv`) with explicit,
 * documented seeds — one per run — derived from `seedFromClientIds`.
 *
 * The harness deliberately **reuses** `m22ArchBenchmark.ts`'s primitives
 * via shared helpers (`stratifiedTrainValIndices`, `readValLogs`,
 * `tryGitHead`) and extends the matrix with `samplingMode`,
 * `poolingMode`, `profile`, and `lossMode` instead of forking the world.
 * Identity scenarios mirror M22's `a` (no identity) and `abc`
 * (identity active) by toggling the manifest's `identityEnabled`.
 *
 * Per-run output includes:
 *   - `samplingMode` and `seed` (M23-13, M23-18, M23-19)
 *   - Ranking metrics from `computeRankingEvalM22` (M23-16, M23-17)
 *   - Bucket telemetry summary from `samplingMetadata` (M23-14)
 *   - Identity guardrail counters (M23-15)
 */

const EPOCHS = 30
const BATCH_SIZE = 16
const DEFAULT_PROFILE: NeuralArchProfile = 'baseline'
const DEFAULT_LOSS_MODE: NeuralLossMode = 'bce'
const RANKING_K = 5
const TOP_N_CUTOFF = 10
/** Fixed offset used to derive per-run seeds from a base seed. Documented for reproducibility (M23-13). */
const RUN_SEED_OFFSET = 1009

/** M21 — mean `softplus(neg − pos)` on stacked logits (first half = positives, second = negatives). */
const pairwiseRankingLoss = (_yTrue: tf.Tensor, yPred: tf.Tensor): tf.Tensor =>
  tf.tidy(() => {
    const flat = yPred.reshape([-1])
    const twoP = flat.shape[0] ?? 0
    const p = Math.floor(twoP / 2)
    const pos = flat.slice([0], [p])
    const neg = flat.slice([p], [p])
    return tf.mean(tf.softplus(tf.sub(neg, pos)))
  })

export type M23BenchmarkScenarioId = 'noIdentity' | 'withIdentity'
export const ALL_M23_SCENARIOS: M23BenchmarkScenarioId[] = ['noIdentity', 'withIdentity']

/**
 * Aggregate of `samplingMetadata.perPositive` telemetry into a single
 * report-friendly summary per run. Pure totals, no averaging — callers
 * decide normalization at presentation time.
 */
export interface BucketTelemetrySummary {
  positives: number
  hardAvailableTotal: number
  hardSelectedTotal: number
  mediumAvailableTotal: number
  mediumSelectedTotal: number
  easyAvailableTotal: number
  easySelectedTotal: number
  intraCategoryAvailableTotal: number
  intraCategorySelectedTotal: number
  fallbackHardToMediumTotal: number
  fallbackHardToOtherTotal: number
  fallbackMediumToHardTotal: number
  fallbackMediumToEasyTotal: number
  fallbackEasyToMediumTotal: number
  fallbackEasyToHardTotal: number
  identityGuardrailApplied: number
  identityGuardrailUnavailable: number
}

export function summarizeBucketTelemetry(
  metadata: NegativeSamplingDatasetMetadata | undefined
): BucketTelemetrySummary | null {
  if (!metadata) return null
  const summary: BucketTelemetrySummary = {
    positives: metadata.perPositive.length,
    hardAvailableTotal: 0,
    hardSelectedTotal: 0,
    mediumAvailableTotal: 0,
    mediumSelectedTotal: 0,
    easyAvailableTotal: 0,
    easySelectedTotal: 0,
    intraCategoryAvailableTotal: 0,
    intraCategorySelectedTotal: 0,
    fallbackHardToMediumTotal: 0,
    fallbackHardToOtherTotal: 0,
    fallbackMediumToHardTotal: 0,
    fallbackMediumToEasyTotal: 0,
    fallbackEasyToMediumTotal: 0,
    fallbackEasyToHardTotal: 0,
    identityGuardrailApplied: metadata.identityGuardrailApplied,
    identityGuardrailUnavailable: metadata.identityGuardrailUnavailable,
  }
  for (const t of metadata.perPositive) {
    summary.hardAvailableTotal += t.hardAvailable
    summary.hardSelectedTotal += t.hardSelected
    summary.mediumAvailableTotal += t.mediumAvailable
    summary.mediumSelectedTotal += t.mediumSelected
    summary.easyAvailableTotal += t.easyAvailable
    summary.easySelectedTotal += t.easySelected
    summary.intraCategoryAvailableTotal += t.intraCategoryAvailable
    summary.intraCategorySelectedTotal += t.intraCategorySelected
    summary.fallbackHardToMediumTotal += t.fallbackHardToMedium
    summary.fallbackHardToOtherTotal += t.fallbackHardToOther
    summary.fallbackMediumToHardTotal += t.fallbackMediumToHard
    summary.fallbackMediumToEasyTotal += t.fallbackMediumToEasy
    summary.fallbackEasyToMediumTotal += t.fallbackEasyToMedium
    summary.fallbackEasyToHardTotal += t.fallbackEasyToHard
  }
  return summary
}

export interface M23BenchmarkRunRow {
  samplingMode: NegativeSamplingMode
  scenario: M23BenchmarkScenarioId
  /** Run index within `(samplingMode, scenario)` group, 0-based. */
  runIndex: number
  /** Explicit seed used for both dataset construction and train/val split. */
  seed: number
  identityEnabled: boolean
  profile: NeuralArchProfile
  poolingMode: ProfilePoolingMode
  lossMode: NeuralLossMode
  neuralHeadKind: NeuralHeadKind
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
  ranking: RankingEvalReport
  bucketTelemetry: BucketTelemetrySummary | null
}

export interface M23BenchmarkReport {
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
    profile: NeuralArchProfile
    poolingModesTested: ProfilePoolingMode[]
    profilesTested: NeuralArchProfile[]
    lossModesTested: NeuralLossMode[]
    rankingK: number
    topNCutoff: number
    benchmarkRunsPerConfig: number
    samplingThresholds: {
      softMaxSim: number
      hardMinSim: number
      mediumMinSim: number
    }
    runSeedOffset: number
  }
  configurations: Array<{
    samplingMode: NegativeSamplingMode
    scenario: M23BenchmarkScenarioId
    profile: NeuralArchProfile
    poolingMode: ProfilePoolingMode
    lossMode: NeuralLossMode
    seeds: number[]
  }>
  runs: M23BenchmarkRunRow[]
}

export interface M23BenchmarkOptions {
  apiServiceUrl: string
  neo4jRepo: Neo4jRepository
  /** Defaults to both `legacy` and `stratified`. */
  samplingModes?: NegativeSamplingMode[]
  /** Defaults to both `noIdentity` and `withIdentity` (M23 spec asks for both). */
  scenarios?: M23BenchmarkScenarioId[]
  /** Defaults to `parseNegativeSamplingEnv(...).benchmarkRuns` (>= 2). */
  runsPerConfig?: number
  valFraction?: number
  profiles?: NeuralArchProfile[]
  poolingModes?: ProfilePoolingMode[]
  lossModes?: NeuralLossMode[]
  /** Backward-compatible single-value shortcut; superseded by `profiles`. */
  profile?: NeuralArchProfile
  gitCwdCandidates?: string[]
  /** Allow tests to inject env without mutating `process.env`. */
  env?: NodeJS.ProcessEnv
}

/**
 * Sets `NEGATIVE_SAMPLING_MODE` for the duration of `fn`. We mutate
 * `process.env` because `buildTrainingDataset` reads it directly via
 * `parseNegativeSamplingEnv(process.env)` — this is the supported
 * integration point from T23-5 and matches the production contract.
 * We always restore the previous value on completion.
 */
async function withSamplingRuntime<T>(
  mode: NegativeSamplingMode,
  env: NodeJS.ProcessEnv,
  fn: () => Promise<T>
): Promise<T> {
  const keys = [
    'NEGATIVE_SAMPLING_MODE',
    'SOFT_NEGATIVE_MAX_SIM',
    'HARD_NEGATIVE_MIN_SIM',
    'MEDIUM_NEGATIVE_MIN_SIM',
    'M23_BENCHMARK_RUNS',
  ] as const
  const prev = new Map<string, string | undefined>()
  for (const key of keys) {
    prev.set(key, process.env[key])
  }
  process.env.NEGATIVE_SAMPLING_MODE = mode
  for (const key of keys) {
    if (key === 'NEGATIVE_SAMPLING_MODE') continue
    const value = env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  try {
    return await fn()
  } finally {
    for (const key of keys) {
      const value = prev.get(key)
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

export async function runM23SamplingBenchmark(options: M23BenchmarkOptions): Promise<M23BenchmarkReport> {
  const env = options.env ?? process.env
  const samplingEnv: NegativeSamplingEnv = parseNegativeSamplingEnv(env)
  assertNegativeSamplingEnvOrThrow(samplingEnv)
  const samplingModes: NegativeSamplingMode[] = options.samplingModes ?? ['legacy', 'stratified']
  const scenarios: M23BenchmarkScenarioId[] = options.scenarios ?? [...ALL_M23_SCENARIOS]
  const runsPerConfig = Math.max(2, options.runsPerConfig ?? samplingEnv.benchmarkRuns)
  const valFraction = options.valFraction ?? 0.2
  const profiles = options.profiles ?? (options.profile ? [options.profile] : [DEFAULT_PROFILE])
  const poolingModes = options.poolingModes ?? [buildProfilePoolingRuntimeFromEnv(env).mode]
  const lossModes = options.lossModes ?? [DEFAULT_LOSS_MODE]
  const gitCandidates = options.gitCwdCandidates ?? [process.cwd(), `${process.cwd()}/../..`]

  const { clients, products, orders } = await fetchTrainingData(options.apiServiceUrl)
  const productsById = new Map(products.map((p) => [p.id, p]))
  const productEmbeddingMap = new Map<string, number[]>()
  for (const { id, embedding } of await options.neo4jRepo.getAllProductEmbeddings()) {
    productEmbeddingMap.set(id, embedding)
  }
  const temporal = buildClientPurchaseTemporalMap(orders)
  const baseSeed = seedFromClientIds(clients)

  const configurations: M23BenchmarkReport['configurations'] = []
  const runs: M23BenchmarkRunRow[] = []

  for (const poolingMode of poolingModes) {
    const poolingRuntime = buildProfilePoolingRuntimeFromEnv({
      ...env,
      PROFILE_POOLING_MODE: poolingMode,
    })
    for (const profile of profiles) {
      for (const lossMode of lossModes) {
        const neuralHeadKind = neuralLossModeToHeadKind(lossMode)
        for (const samplingMode of samplingModes) {
          for (const scenario of scenarios) {
            const identityEnabled = scenario === 'withIdentity'
            const manifest = buildM22ManifestFromProducts(products, {
              identityEnabled,
              priceBinEdges: DEFAULT_M22_PRICE_BIN_EDGES,
            })

            const seedsForConfig: number[] = []
            for (let runIndex = 0; runIndex < runsPerConfig; runIndex++) {
              const runSeed = (baseSeed + runIndex * RUN_SEED_OFFSET) | 0
              seedsForConfig.push(runSeed)

              const datasetResult = await withSamplingRuntime(samplingMode, env, async () =>
                buildTrainingDataset(
                  clients,
                  temporal.clientPurchasedProducts,
                  productEmbeddingMap,
                  products,
                  { negativeSamplingRatio: 4, seed: runSeed, useClassWeight: true },
                  temporal,
                  poolingRuntime,
                  { manifest, productsById }
                )
              )
              if (!isM22TrainingDataset(datasetResult)) {
                throw new Error('M23 benchmark expected an M22 dataset shape')
              }
              if (datasetResult.rows.length === 0) {
                throw new Error(
                  `M23 benchmark: no training samples for samplingMode=${samplingMode}, scenario=${scenario}, profile=${profile}, poolingMode=${poolingMode}, lossMode=${lossMode}`
                )
              }

              const split = stratifiedTrainValIndices(datasetResult.labels, valFraction, runSeed + 42)
              if (split.val.length === 0) {
                throw new Error('Validation split is empty — increase data or lower valFraction')
              }
              const rowsTrainBce = split.train.map((i) => datasetResult.rows[i]!)
              const labelsTrainBce = split.train.map((i) => datasetResult.labels[i]!)
              const rowsValBce = split.val.map((i) => datasetResult.rows[i]!)
              const labelsValBce = split.val.map((i) => datasetResult.labels[i]!)

              let fitRowsTrain = rowsTrainBce
              let fitLabelsTrain = labelsTrainBce
              let fitRowsVal = rowsValBce
              let fitLabelsVal = labelsValBce
              if (lossMode === 'pairwise') {
                const pairTrain = m22BceLabelsToPairwiseRows(rowsTrainBce, labelsTrainBce)
                if (pairTrain.pairCount === 0) {
                  throw new Error('M23 benchmark: no pairwise contrastive pairs in training split')
                }
                fitRowsTrain = pairTrain.rows
                fitLabelsTrain = new Array<number>(pairTrain.rows.length).fill(1)

                const pairVal = m22BceLabelsToPairwiseRows(rowsValBce, labelsValBce)
                if (pairVal.pairCount > 0) {
                  fitRowsVal = pairVal.rows
                  fitLabelsVal = new Array<number>(pairVal.rows.length).fill(1)
                } else {
                  fitRowsVal = []
                  fitLabelsVal = []
                }
              }

              const model = buildM22HybridNeuralModel(manifest.vocabSizes, lossMode, profile)
              if (lossMode === 'pairwise') {
                model.compile({ optimizer: 'adam', loss: pairwiseRankingLoss, metrics: [] })
              } else {
                model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] })
              }
              const trainableParams = model.countParams()

              const xTrain = m22InputTensorListFromRows(fitRowsTrain)
              const yTrain = tf.tensor2d(
                fitLabelsTrain.map((l) => [l]),
                [fitLabelsTrain.length, 1]
              )
              const xVal = fitRowsVal.length > 0 ? m22InputTensorListFromRows(fitRowsVal) : null
              const yVal =
                fitRowsVal.length > 0
                  ? tf.tensor2d(
                      fitLabelsVal.map((l) => [l]),
                      [fitLabelsVal.length, 1]
                    )
                  : null

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

              const fitArgs: tf.ModelFitArgs = {
                epochs: EPOCHS,
                batchSize: BATCH_SIZE,
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
              }
              if (lossMode === 'bce') {
                fitArgs.classWeight = { 0: 1.0, 1: 4.0 }
              }
              if (xVal && yVal) {
                fitArgs.validationData = [xVal, yVal]
              }

              await model.fit(xTrain, yTrain, fitArgs)

              const durationMs = Date.now() - t0
              const valScores = predictM22HybridScores(model, rowsValBce, neuralHeadKind)
              const valMetrics = summarizeBinaryMetrics(labelsValBce, valScores)

              const ranking = computeRankingEvalM22(
                clients,
                orders,
                productEmbeddingMap,
                model,
                poolingRuntime,
                neuralHeadKind,
                productsById,
                { manifest, productsById },
                RANKING_K,
                TOP_N_CUTOFF
              )
              const bucketTelemetry = summarizeBucketTelemetry(datasetResult.samplingMetadata)

              xTrain.forEach((t) => t.dispose())
              yTrain.dispose()
              xVal?.forEach((t) => t.dispose())
              yVal?.dispose()
              model.dispose()

              runs.push({
                samplingMode,
                scenario,
                runIndex,
                seed: runSeed,
                identityEnabled,
                profile,
                poolingMode: poolingRuntime.mode,
                lossMode,
                neuralHeadKind,
                trainableParams,
                trainingSamples: fitRowsTrain.length,
                trainRows: fitRowsTrain.length,
                valRows: fitRowsVal.length,
                durationMs,
                bestEpoch,
                stoppedEarly,
                finalTrainLoss,
                finalTrainAccuracy,
                finalValLoss,
                finalValAccuracy,
                trainValLossGap: finalValLoss !== null ? finalTrainLoss - finalValLoss : null,
                valMetrics,
                ranking,
                bucketTelemetry,
              })
            }

            configurations.push({
              samplingMode,
              scenario,
              profile,
              poolingMode: poolingRuntime.mode,
              lossMode,
              seeds: seedsForConfig,
            })
          }
        }
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
      poolingMode: poolingModes[0] ?? buildProfilePoolingRuntimeFromEnv(env).mode,
      poolingHalfLifeDays: buildProfilePoolingRuntimeFromEnv({
        ...env,
        PROFILE_POOLING_MODE: poolingModes[0] ?? buildProfilePoolingRuntimeFromEnv(env).mode,
      }).halfLifeDays,
      profile: profiles[0] ?? DEFAULT_PROFILE,
      poolingModesTested: poolingModes,
      profilesTested: profiles,
      lossModesTested: lossModes,
      rankingK: RANKING_K,
      topNCutoff: TOP_N_CUTOFF,
      benchmarkRunsPerConfig: runsPerConfig,
      samplingThresholds: {
        softMaxSim: samplingEnv.softMaxSim,
        hardMinSim: samplingEnv.hardMinSim,
        mediumMinSim: samplingEnv.mediumMinSim,
      },
      runSeedOffset: RUN_SEED_OFFSET,
    },
    configurations,
    runs,
  }
}
