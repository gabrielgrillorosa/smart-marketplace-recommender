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
  country: string
}

interface ProductDTO {
  id: string
  name: string
  description: string
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

interface PageResponse<T> {
  content: T[]
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
    if (res.status >= 500) throw new ApiServiceUnavailableError()
    return res.json()
  }

  const [clientsPage, productsPage] = (await Promise.all([
    fetchOrThrow(`${apiServiceUrl}/api/v1/clients?page=0&size=1000`),
    fetchOrThrow(`${apiServiceUrl}/api/v1/products?page=0&size=1000`),
  ])) as [PageResponse<ClientDTO>, PageResponse<ProductDTO>]

  const clients = clientsPage.content
  const products = productsPage.content

  const ordersArrays = await Promise.all(
    clients.map(async (c) => {
      const page = (await fetchOrThrow(
        `${apiServiceUrl}/api/v1/clients/${c.id}/orders?page=0&size=1000`
      )) as PageResponse<OrderDTO>
      return page.content.map((o) => ({ ...o, clientId: c.id }))
    })
  )

  return { clients, products, orders: ordersArrays.flat() }
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
          },
        },
      })

      xs.dispose()
      ys.dispose()

      await model.save('file:///tmp/model')

      const trainedAt = new Date().toISOString()
      const durationMs = Date.now() - startMs
      this.modelStore.setModel(model, { trainedAt, finalLoss, finalAccuracy, trainingSamples, durationMs })
      this._isTraining = false

      return { status: 'trained', epochs: EPOCHS, finalLoss, finalAccuracy, trainingSamples, durationMs }
    } catch (err) {
      this._isTraining = false
      this.modelStore.reset()
      throw err
    }
  }
}
