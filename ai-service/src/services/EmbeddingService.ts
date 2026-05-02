import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers'
import { Neo4jRepository, Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'

export class AlreadyRunningError extends Error {
  constructor() {
    super('Generation already in progress')
    this.name = 'AlreadyRunningError'
  }
}

export class EmbeddingService {
  private embeddings: HuggingFaceTransformersEmbeddings | null = null
  private isGenerating = false
  private modelReady = false

  constructor(private readonly modelName: string) {}

  async init(): Promise<void> {
    const delaysMs = [2000, 8000, 20000]
    let lastErr: unknown
    for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
      try {
        this.embeddings = new HuggingFaceTransformersEmbeddings({
          model: this.modelName,
        })
        await this.embeddings.embedQuery('')
        this.modelReady = true
        return
      } catch (err) {
        lastErr = err
        const wait = delaysMs[attempt]
        if (wait === undefined) break
        console.warn(
          `[EmbeddingService] Warm-up attempt ${attempt + 1} failed; retry in ${wait}ms:`,
          err instanceof Error ? err.message : err
        )
        await new Promise((r) => setTimeout(r, wait))
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  get isReady(): boolean {
    return this.modelReady
  }

  async embedText(text: string): Promise<number[]> {
    if (!this.embeddings) {
      throw new Error('EmbeddingService not initialized. Call init() first.')
    }
    return this.embeddings.embedQuery(text)
  }

  async generateEmbeddings(
    repo: Neo4jRepository
  ): Promise<{ generated: number; skipped: number; indexCreated: boolean }> {
    if (this.isGenerating) {
      throw new AlreadyRunningError()
    }

    this.isGenerating = true
    let generated = 0
    let skipped = 0

    try {
      const products = await repo.getProductsWithoutEmbedding()
      skipped = 0 // products already embedded are not returned (WHERE embedding IS NULL)
      const total = products.length

      for (let i = 0; i < total; i++) {
        const product = products[i]
        const text = `${product.name} ${product.description} ${product.category}`
        const embedding = await this.embedText(text)
        await repo.setProductEmbedding(product.id, embedding)
        generated++

        if (generated % 10 === 0) {
          console.log(`[${generated}/${total}] Produto "${product.name}" embedado`)
        }
      }

      await repo.createVectorIndex()

      return { generated, skipped, indexCreated: true }
    } catch (err) {
      if (err instanceof Neo4jUnavailableError) throw err
      throw err
    } finally {
      this.isGenerating = false
    }
  }
}
