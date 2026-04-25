import * as tf from '@tensorflow/tfjs-node'
import { ModelStore } from './ModelStore.js'
import { Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { EmbeddingService } from './EmbeddingService.js'
import { TrainingResult } from '../types/index.js'

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

interface ClientDTO {
  id: string
  name: string
  segment: string
  countryCode: string
}

interface ProductDTO {
  id: string
  name: string
  description?: string
  category: string
  price: number
  sku: string
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
  model.add(tf.layers.dense({ units: 256, activation: 'relu', inputShape: [768] }))
  model.add(tf.layers.dropout({ rate: 0.3 }))
  model.add(tf.layers.dense({ units: 128, activation: 'relu' }))
  model.add(tf.layers.dropout({ rate: 0.2 }))
  model.add(tf.layers.dense({ units: 64, activation: 'relu' }))
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }))
  return model
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

      const clientOrderMap = new Map<string, Set<string>>()
      for (const order of orders) {
        if (!clientOrderMap.has(order.clientId)) clientOrderMap.set(order.clientId, new Set())
        for (const item of order.items) {
          clientOrderMap.get(order.clientId)!.add(item.productId)
        }
      }

      const inputVectors: number[][] = []
      const labels: number[] = []

      for (const client of clients) {
        const purchasedIds = clientOrderMap.get(client.id) ?? new Set<string>()
        const purchasedEmbeddings: number[][] = []

        for (const pid of purchasedIds) {
          const emb = productEmbeddingMap.get(pid)
          if (!emb) {
            console.warn(`[ModelTrainer] Product ${pid} skipped: no embedding`)
            continue
          }
          purchasedEmbeddings.push(emb)
        }
        if (purchasedEmbeddings.length === 0) continue

        const clientProfileVector = meanPooling(purchasedEmbeddings)

        for (const product of products) {
          const productEmb = productEmbeddingMap.get(product.id)
          if (!productEmb) continue
          inputVectors.push([...productEmb, ...clientProfileVector])
          labels.push(purchasedIds.has(product.id) ? 1 : 0)
        }
      }

      const trainingSamples = inputVectors.length
      const EPOCHS = 20
      const BATCH_SIZE = 32

      // xs and ys are passed to async model.fit() — must be disposed manually after (ADR-008)
      const xs = tf.tensor2d(inputVectors, [trainingSamples, 768])
      const ys = tf.tensor2d(
        labels.map((l) => [l]),
        [trainingSamples, 1]
      )

      let finalLoss = 0
      let finalAccuracy = 0

      const model = buildModel()
      model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] })

      await model.fit(xs, ys, {
        epochs: EPOCHS,
        batchSize: BATCH_SIZE,
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
