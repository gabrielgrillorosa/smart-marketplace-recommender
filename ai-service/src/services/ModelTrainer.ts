import * as tf from '@tensorflow/tfjs-node'
import { ModelStore } from './ModelStore.js'
import { BoughtSyncEdge, Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { EmbeddingService } from './EmbeddingService.js'
import { TrainingResult } from '../types/index.js'
import { buildTrainingDataset, seedFromClientIds } from './training-utils.js'
import {
  fetchTrainingData,
  normalizeOrderDateFromApi,
  type OrderDTO,
} from './training-data-fetch.js'
import { buildNeuralModel } from '../ml/neuralModelFactory.js'
import { computePrecisionAtK } from '../ml/rankingEval.js'
import { buildClientPurchaseTemporalMap } from './training-temporal-map.js'
import type { ProfilePoolingRuntime } from '../profile/clientProfileAggregation.js'

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
    private readonly profilePooling: ProfilePoolingRuntime
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

      const { inputVectors, labels } = buildTrainingDataset(
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
        this.profilePooling
      )

      if (inputVectors.length === 0) {
        throw new Error('No training samples')
      }

      const trainingSamples = inputVectors.length
      const EPOCHS = 30
      const BATCH_SIZE = 16

      if (inputVectors[0]?.length !== 768) {
        throw new Error(`Expected input dimension 768, got ${inputVectors[0]?.length ?? 0}`)
      }

      // xs and ys are passed to async model.fit() — must be disposed manually after (ADR-008)
      const xs = tf.tensor2d(inputVectors, [trainingSamples, 768])
      const ys = tf.tensor2d(
        labels.map((l) => [l]),
        [trainingSamples, 1]
      )

      let finalLoss = 0
      let finalAccuracy = 0
      let prevLoss = Infinity
      let patienceCounter = 0
      const PATIENCE = 5
      const LOSS_MIN_DELTA = 1e-4

      const model = buildNeuralModel('baseline')
      model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] })

      await model.fit(xs, ys, {
        epochs: EPOCHS,
        batchSize: BATCH_SIZE,
        classWeight: { 0: 1.0, 1: 4.0 },
        callbacks: {
          onEpochEnd: (epoch: number, logs?: tf.Logs) => {
            const loss = logs?.loss ?? 0
            const accuracy = logs?.acc ?? logs?.accuracy ?? 0
            finalLoss = loss
            finalAccuracy = accuracy
            console.info(
              `[ModelTrainer] Epoch ${epoch + 1}/${EPOCHS} — loss: ${loss.toFixed(4)} — accuracy: ${accuracy.toFixed(4)}`
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
      })

      xs.dispose()
      ys.dispose()

      let precisionAt5 = 0
      try {
        precisionAt5 = computePrecisionAtK(clients, orders, productEmbeddingMap, model, 5, this.profilePooling)
      } catch (precErr) {
        console.warn('[ModelTrainer] computePrecisionAtK failed (non-fatal):', precErr)
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
        model,
      }
    } catch (err) {
      this._isTraining = false
      throw err
    }
  }
}
