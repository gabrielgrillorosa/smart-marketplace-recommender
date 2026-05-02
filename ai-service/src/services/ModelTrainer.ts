import * as tf from '@tensorflow/tfjs-node'
import type { M22EnvFlags } from '../config/m22Env.js'
import { ModelStore } from './ModelStore.js'
import { BoughtSyncEdge, Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { EmbeddingService } from './EmbeddingService.js'
import type { NeuralLossMode } from '../types/index.js'
import { TrainingResult } from '../types/index.js'
import {
  buildTrainingDataset,
  seedFromClientIds,
  bceLabelsToPairwiseRows,
  m22BceLabelsToPairwiseRows,
  isM22TrainingDataset,
} from './training-utils.js'
import {
  fetchTrainingData,
  normalizeOrderDateFromApi,
  type OrderDTO,
} from './training-data-fetch.js'
import { buildNeuralModel, buildM22HybridNeuralModel, m22InputTensorListFromRows } from '../ml/neuralModelFactory.js'
import { computePrecisionAtK, computePrecisionAtKM22 } from '../ml/rankingEval.js'
import { neuralLossModeToHeadKind } from '../ml/neuralHead.js'
import { buildClientPurchaseTemporalMap } from './training-temporal-map.js'
import type { ProfilePoolingRuntimeHolder } from '../config/profilePoolingRuntimeHolder.js'
import { DEFAULT_M22_PRICE_BIN_EDGES } from '../ml/itemSparseFeatureExtractor.js'
import { buildM22ManifestFromProducts } from '../ml/m22Manifest.js'

export { ApiServiceUnavailableError } from './training-data-fetch.js'

export class ConflictError extends Error {
  readonly statusCode = 409
  constructor() {
    super('Training already in progress')
    this.name = 'ConflictError'
  }
}

export interface TrainingDataProbe {
  hasTrainingData: boolean
  clients: number
  products: number
  orders: number
}

export interface TrainedCandidate extends TrainingResult {
  model: tf.LayersModel
}

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

export class ModelTrainer {
  private _isTraining = false
  private _progressCallback?: (epoch: number, totalEpochs: number, loss: number) => void

  constructor(
    private readonly _modelStore: ModelStore,
    private readonly repo: Neo4jRepository,
    // EmbeddingService injected for dependency consistency; reserved for future use
    private readonly _embeddingService: EmbeddingService,
    private readonly apiServiceUrl: string,
    private readonly neuralWeight: number,
    private readonly semanticWeight: number,
    private readonly profilePooling: ProfilePoolingRuntimeHolder,
    private readonly neuralLossMode: NeuralLossMode = 'bce',
    private readonly m22Env: M22EnvFlags
  ) {}

  get isTraining(): boolean {
    return this._isTraining
  }

  setProgressCallback(cb: (epoch: number, totalEpochs: number, loss: number) => void): void {
    this._progressCallback = cb
  }

  async probeTrainingDataAvailability(): Promise<TrainingDataProbe> {
    const { clients, products, orders } = await fetchTrainingData(this.apiServiceUrl)
    const hasOrdersWithItems = orders.some((order) => order.items.length > 0)

    return {
      hasTrainingData: clients.length > 0 && products.length > 0 && hasOrdersWithItems,
      clients: clients.length,
      products: products.length,
      orders: orders.length,
    }
  }

  private async syncNeo4j(
    orders: OrderDTO[],
    productEmbeddingMap: Map<string, number[]>
  ): Promise<{ syncedAt: string }> {
    const edges: BoughtSyncEdge[] = []
    const seenPair = new Set<string>()

    for (const order of orders) {
      const orderDateIso = normalizeOrderDateFromApi(order.orderDate)
      if (!orderDateIso) {
        console.warn(`[Sync] skipping order ${order.id} — missing or invalid orderDate`)
        continue
      }
      const orderId = String(order.id)

      for (const item of order.items) {
        if (!productEmbeddingMap.has(item.productId)) {
          console.warn(`[Sync] skipping ${item.productId} — no embedding`)
          continue
        }
        const dedupeKey = `${orderId}:${item.productId}`
        if (seenPair.has(dedupeKey)) continue
        seenPair.add(dedupeKey)
        edges.push({
          clientId: order.clientId,
          productId: item.productId,
          orderId,
          orderDate: orderDateIso,
        })
      }
    }

    const { created, existed, skipped } = await this.repo.syncBoughtRelationships(edges)
    console.info(`[Sync] ${created} created, ${existed} already existed, ${skipped} skipped`)

    return { syncedAt: new Date().toISOString() }
  }

  async train(): Promise<TrainedCandidate> {
    if (this._isTraining) throw new ConflictError()

    this._isTraining = true
    const startMs = Date.now()

    try {
      const { clients, products, orders } = await fetchTrainingData(this.apiServiceUrl)

      const productEmbeddingMap = new Map<string, number[]>()
      const allProductEmbs = await this.repo.getAllProductEmbeddings()
      for (const { id, embedding } of allProductEmbs) {
        productEmbeddingMap.set(id, embedding)
      }

      let syncedAt = new Date().toISOString()
      try {
        const syncResult = await this.syncNeo4j(orders, productEmbeddingMap)
        syncedAt = syncResult.syncedAt
      } catch (syncErr) {
        console.warn('[ModelTrainer] Neo4j sync failed (non-fatal):', syncErr)
      }

      const temporal = buildClientPurchaseTemporalMap(orders)
      const clientOrderMap = temporal.clientPurchasedProducts

      const trainM22Structural = this.m22Env.enabled && this.m22Env.structural
      const m22Manifest = trainM22Structural
        ? buildM22ManifestFromProducts(products, {
            identityEnabled: this.m22Env.identity,
            priceBinEdges: DEFAULT_M22_PRICE_BIN_EDGES,
          })
        : null

      const productsById = new Map(products.map((p) => [p.id, p]))

      const dataset =
        trainM22Structural && m22Manifest
          ? buildTrainingDataset(
              clients,
              clientOrderMap,
              productEmbeddingMap,
              products,
              {
                negativeSamplingRatio: 4,
                seed: seedFromClientIds(clients),
                useClassWeight: true,
              },
              temporal,
              this.profilePooling.get(),
              { manifest: m22Manifest, productsById }
            )
          : buildTrainingDataset(
              clients,
              clientOrderMap,
              productEmbeddingMap,
              products,
              {
                negativeSamplingRatio: 4,
                seed: seedFromClientIds(clients),
                useClassWeight: true,
              },
              temporal,
              this.profilePooling.get()
            )

      const useM22 = isM22TrainingDataset(dataset)

      if (isM22TrainingDataset(dataset)) {
        if (dataset.rows.length === 0) {
          throw new Error('No training samples')
        }
      } else {
        if (dataset.inputVectors.length === 0) {
          throw new Error('No training samples')
        }
        if (dataset.inputVectors[0]?.length !== 768) {
          throw new Error(`Expected input dimension 768, got ${dataset.inputVectors[0]?.length ?? 0}`)
        }
      }

      const EPOCHS = 30
      const BATCH_SIZE = 16
      const neuralHeadKind = neuralLossModeToHeadKind(this.neuralLossMode)

      let xs: tf.Tensor2D | null = null
      let ys: tf.Tensor2D
      let trainingSamples: number
      let model: tf.LayersModel
      let m22FitTensors: tf.Tensor[] | null = null

      if (isM22TrainingDataset(dataset)) {
        if (!m22Manifest) {
          throw new Error('Internal error: M22 dataset rows without manifest')
        }
        const { rows, labels } = dataset
        if (this.neuralLossMode === 'pairwise') {
          const { rows: pr, pairCount } = m22BceLabelsToPairwiseRows(rows, labels)
          if (pairCount === 0) {
            throw new Error('No pairwise contrastive pairs for training')
          }
          trainingSamples = pr.length
          m22FitTensors = m22InputTensorListFromRows(pr)
          ys = tf.ones([trainingSamples, 1])
          model = buildM22HybridNeuralModel(m22Manifest.vocabSizes, 'pairwise')
          model.compile({ optimizer: 'adam', loss: pairwiseRankingLoss, metrics: [] })
        } else {
          trainingSamples = rows.length
          m22FitTensors = m22InputTensorListFromRows(rows)
          ys = tf.tensor2d(
            labels.map((l) => [l]),
            [trainingSamples, 1]
          )
          model = buildM22HybridNeuralModel(m22Manifest.vocabSizes, 'bce')
          model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] })
        }
      } else {
        const { inputVectors, labels } = dataset
        if (this.neuralLossMode === 'pairwise') {
          const { rows, pairCount } = bceLabelsToPairwiseRows(inputVectors, labels)
          if (pairCount === 0) {
            throw new Error('No pairwise contrastive pairs for training')
          }
          trainingSamples = rows.length
          xs = tf.tensor2d(rows, [trainingSamples, 768])
          ys = tf.ones([trainingSamples, 1])
          model = buildNeuralModel('baseline', 'pairwise')
          model.compile({ optimizer: 'adam', loss: pairwiseRankingLoss, metrics: [] })
        } else {
          trainingSamples = inputVectors.length
          xs = tf.tensor2d(inputVectors, [trainingSamples, 768])
          ys = tf.tensor2d(
            labels.map((l) => [l]),
            [trainingSamples, 1]
          )
          model = buildNeuralModel('baseline', 'bce')
          model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] })
        }
      }

      let finalLoss = 0
      let finalAccuracy = 0
      let prevLoss = Infinity
      let patienceCounter = 0
      const PATIENCE = 5
      const LOSS_MIN_DELTA = 1e-4

      const fitArgs: tf.ModelFitArgs = {
        epochs: EPOCHS,
        batchSize: BATCH_SIZE,
        callbacks: {
          onEpochEnd: (epoch: number, logs?: tf.Logs) => {
            const loss = logs?.loss ?? 0
            const accuracy = logs?.acc ?? logs?.accuracy ?? 0
            finalLoss = loss
            finalAccuracy = accuracy
            const accSuffix =
              this.neuralLossMode === 'pairwise' ? '' : ` — accuracy: ${accuracy.toFixed(4)}`
            console.info(
              `[ModelTrainer] Epoch ${epoch + 1}/${EPOCHS} — loss: ${loss.toFixed(4)}${accSuffix}`
            )
            this._progressCallback?.(epoch + 1, EPOCHS, loss)

            if (prevLoss - loss > LOSS_MIN_DELTA) {
              patienceCounter = 0
            } else {
              patienceCounter++
              if (patienceCounter >= PATIENCE) {
                console.info(`[ModelTrainer] Early stopping at epoch ${epoch + 1} (patience=${PATIENCE})`)
                model.stopTraining = true
              }
            }
            prevLoss = loss
          },
        },
      }
      if (this.neuralLossMode === 'bce') {
        fitArgs.classWeight = { 0: 1.0, 1: 4.0 }
      }

      if (m22FitTensors) {
        await model.fit(m22FitTensors, ys, fitArgs)
        m22FitTensors.forEach((t) => t.dispose())
        m22FitTensors = null
      } else {
        await model.fit(xs!, ys, fitArgs)
        xs?.dispose()
      }
      ys.dispose()

      let precisionAt5 = 0
      try {
        if (useM22 && m22Manifest) {
          precisionAt5 = computePrecisionAtKM22(
            clients,
            orders,
            productEmbeddingMap,
            model,
            5,
            this.profilePooling.get(),
            neuralHeadKind,
            { manifest: m22Manifest, productsById }
          )
        } else {
          precisionAt5 = computePrecisionAtK(
            clients,
            orders,
            productEmbeddingMap,
            model,
            5,
            this.profilePooling.get(),
            neuralHeadKind
          )
        }
      } catch (precErr) {
        console.warn('[ModelTrainer] precision@5 eval failed (non-fatal):', precErr)
      }

      await model.save('file:///tmp/model')

      const durationMs = Date.now() - startMs
      this._isTraining = false

      return {
        status: 'trained',
        epochs: EPOCHS,
        finalLoss,
        finalAccuracy,
        trainingSamples,
        durationMs,
        syncedAt,
        precisionAt5,
        neuralHeadKind,
        model,
        m22ItemManifest: useM22 ? m22Manifest : null,
        modelArchitecture: useM22 ? 'm22' : 'baseline',
      }
    } catch (err) {
      this._isTraining = false
      throw err
    }
  }
}
