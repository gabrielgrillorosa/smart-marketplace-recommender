import * as tf from '@tensorflow/tfjs-node'
import { ModelStore } from './ModelStore.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { EmbeddingService } from './EmbeddingService.js'
import { TrainingResult } from '../types/index.js'
import { buildTrainingDataset, type ClientDTO, type ProductDTO } from './training-utils.js'

export class ConflictError extends Error {
  readonly statusCode = 409
  constructor() {
    super('Training already in progress')
    this.name = 'ConflictError'
  }
}

export class ApiServiceUnavailableError extends Error {
  readonly statusCode = 503
  constructor() {
    super('API Service unavailable. Cannot fetch training data.')
    this.name = 'ApiServiceUnavailableError'
  }
}

interface OrderItemDTO {
  productId: string
  quantity: number
}

interface OrderDTO {
  id: string
  clientId: string
  items: OrderItemDTO[]
}

const PAGE_SIZE = 100

interface PageResponse<T> {
  items: T[]
  totalPages: number
}

export interface TrainingDataProbe {
  hasTrainingData: boolean
  clients: number
  products: number
  orders: number
}

async function fetchAllPages<T>(
  baseUrl: string,
  fetchOrThrow: (url: string) => Promise<unknown>
): Promise<T[]> {
  const firstPage = (await fetchOrThrow(`${baseUrl}&page=0&size=${PAGE_SIZE}`)) as PageResponse<T>
  const allItems: T[] = [...firstPage.items]

  for (let p = 1; p < firstPage.totalPages; p++) {
    const page = (await fetchOrThrow(`${baseUrl}&page=${p}&size=${PAGE_SIZE}`)) as PageResponse<T>
    allItems.push(...page.items)
  }

  return allItems
}

async function fetchTrainingData(apiServiceUrl: string): Promise<{
  clients: ClientDTO[]
  products: ProductDTO[]
  orders: OrderDTO[]
}> {
  const fetchOrThrow = async (url: string): Promise<unknown> => {
    let res: Response
    try {
      res = await fetch(url)
    } catch {
      throw new ApiServiceUnavailableError()
    }
    if (!res.ok) {
      if (res.status >= 500) throw new ApiServiceUnavailableError()
      const body = await res.text()
      throw new Error(`API error ${res.status}: ${body}`)
    }
    return res.json()
  }

  const [clients, products] = await Promise.all([
    fetchAllPages<ClientDTO>(`${apiServiceUrl}/api/v1/clients?`, fetchOrThrow),
    fetchAllPages<ProductDTO>(`${apiServiceUrl}/api/v1/products?`, fetchOrThrow),
  ])

  console.log(`[ModelTrainer] Fetched ${clients.length} clients, ${products.length} products`)

  const ordersArrays = await Promise.all(
    clients.map(async (c) => {
      const orders = await fetchAllPages<OrderDTO>(
        `${apiServiceUrl}/api/v1/clients/${c.id}/orders?`,
        fetchOrThrow
      )
      return orders.map((o) => ({ ...o, clientId: c.id }))
    })
  )

  const orders = ordersArrays.flat()
  console.log(`[ModelTrainer] Fetched ${orders.length} orders total`)

  return { clients, products, orders }
}

function meanPooling(embeddings: number[][]): number[] {
  const dims = embeddings[0].length
  const mean = new Array<number>(dims).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < dims; i++) mean[i] += emb[i]
  }
  return mean.map((v) => v / embeddings.length)
}

function buildModel(): tf.Sequential {
  const model = tf.sequential()
  model.add(
    tf.layers.dense({
      units: 64,
      activation: 'relu',
      inputShape: [768],
      kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }),
    })
  )
  model.add(tf.layers.dropout({ rate: 0.2 }))
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }))
  return model
}

function seedFromClientIds(clients: ClientDTO[]): number {
  let seed = 0
  for (const client of clients) {
    const prefix = client.id.slice(0, 8)
    for (let i = 0; i < prefix.length; i++) {
      seed += prefix.charCodeAt(i)
    }
  }
  return seed
}

export class ModelTrainer {
  private _isTraining = false
  private _progressCallback?: (epoch: number, totalEpochs: number, loss: number) => void

  constructor(
    private readonly modelStore: ModelStore,
    private readonly repo: Neo4jRepository,
    // EmbeddingService injected for dependency consistency; reserved for future use
    private readonly _embeddingService: EmbeddingService,
    private readonly apiServiceUrl: string,
    private readonly neuralWeight: number,
    private readonly semanticWeight: number,
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
    const edges: Array<{ clientId: string; productId: string }> = []

    for (const order of orders) {
      for (const item of order.items) {
        if (productEmbeddingMap.has(item.productId)) {
          edges.push({ clientId: order.clientId, productId: item.productId })
        } else {
          console.warn(`[Sync] skipping ${item.productId} — no embedding`)
        }
      }
    }

    const { created, existed, skipped } = await this.repo.syncBoughtRelationships(edges)
    console.info(`[Sync] ${created} created, ${existed} already existed, ${skipped} skipped`)

    return { syncedAt: new Date().toISOString() }
  }

  private computePrecisionAtK(
    clients: ClientDTO[],
    orders: OrderDTO[],
    productEmbeddingMap: Map<string, number[]>,
    model: tf.LayersModel,
    K = 5
  ): number {
    const clientOrderMap = new Map<string, string[]>()
    for (const order of orders) {
      if (!clientOrderMap.has(order.clientId)) clientOrderMap.set(order.clientId, [])
      for (const item of order.items) {
        clientOrderMap.get(order.clientId)!.push(item.productId)
      }
    }

    const allProductIds = Array.from(productEmbeddingMap.keys())
    let clientsWithHit = 0
    let totalClients = 0

    for (const client of clients) {
      const allPurchased = clientOrderMap.get(client.id) ?? []
      if (allPurchased.length < 2) continue

      const splitIdx = Math.floor(allPurchased.length * 0.8)
      const trainPurchased = new Set(allPurchased.slice(0, splitIdx))
      const heldOut = new Set(allPurchased.slice(splitIdx))

      const trainEmbs: number[][] = []
      for (const pid of trainPurchased) {
        const emb = productEmbeddingMap.get(pid)
        if (emb) trainEmbs.push(emb)
      }
      if (trainEmbs.length === 0) continue

      const clientProfile = meanPooling(trainEmbs)
      const candidates = allProductIds.filter((pid) => !trainPurchased.has(pid))
      if (candidates.length === 0) continue

      const scores = tf.tidy(() => {
        const matrix = tf.tensor2d(
          candidates.map((pid) => [...productEmbeddingMap.get(pid)!, ...clientProfile]),
          [candidates.length, 768]
        )
        const output = model.predict(matrix) as tf.Tensor
        return Array.from(output.dataSync())
      })

      const topK = candidates
        .map((pid, i) => ({ pid, score: scores[i] }))
        .sort((a, b) => b.score - a.score)
        .slice(0, K)
        .map((x) => x.pid)

      const hasHit = topK.some((pid) => heldOut.has(pid))
      if (hasHit) clientsWithHit++
      totalClients++
    }

    return totalClients === 0 ? 0 : clientsWithHit / totalClients
  }

  async train(): Promise<TrainingResult> {
    if (this._isTraining) throw new ConflictError()

    this._isTraining = true
    this.modelStore.setTraining(new Date().toISOString())
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

      let demoPairs: { clientId: string; productId: string }[] = []
      try {
        demoPairs = await this.repo.getAllDemoBoughtPairs()
        if (demoPairs.length > 0) {
          console.info(`[ModelTrainer] ${demoPairs.length} demo purchase(s) will be included in training`)
        }
      } catch (demoErr) {
        console.warn('[ModelTrainer] Failed to fetch demo purchases (non-fatal):', demoErr)
      }

      const clientOrderMap = new Map<string, Set<string>>()
      for (const order of orders) {
        if (!clientOrderMap.has(order.clientId)) clientOrderMap.set(order.clientId, new Set())
        for (const item of order.items) {
          clientOrderMap.get(order.clientId)!.add(item.productId)
        }
      }

      // Merge demo purchases — ADR-026: creates new entries for clients with demos but no real orders
      for (const { clientId, productId } of demoPairs) {
        if (!clientOrderMap.has(clientId)) clientOrderMap.set(clientId, new Set())
        clientOrderMap.get(clientId)!.add(productId)
      }

      const { inputVectors, labels } = buildTrainingDataset(
        clients,
        clientOrderMap,
        productEmbeddingMap,
        products,
        {
          negativeSamplingRatio: 4,
          seed: seedFromClientIds(clients),
          useClassWeight: true,
        }
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

      const model = buildModel()
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
            this.modelStore.setProgress(epoch + 1, EPOCHS)
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
        precisionAt5 = this.computePrecisionAtK(clients, orders, productEmbeddingMap, model)
      } catch (precErr) {
        console.warn('[ModelTrainer] computePrecisionAtK failed (non-fatal):', precErr)
      }

      await model.save('file:///tmp/model')

      const trainedAt = new Date().toISOString()
      const durationMs = Date.now() - startMs
      this.modelStore.setModel(model, { trainedAt, finalLoss, finalAccuracy, trainingSamples, durationMs, syncedAt, precisionAt5 })
      this._isTraining = false

      return { status: 'trained', epochs: EPOCHS, finalLoss, finalAccuracy, trainingSamples, durationMs, syncedAt, precisionAt5 }
    } catch (err) {
      this._isTraining = false
      this.modelStore.reset()
      throw err
    }
  }
}
