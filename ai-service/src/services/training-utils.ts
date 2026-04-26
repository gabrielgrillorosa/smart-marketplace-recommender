export interface ClientDTO {
  id: string
  name: string
  segment: string
  countryCode: string
}

export interface ProductDTO {
  id: string
  name: string
  description?: string
  category: string
  price: number
  sku: string
}

export interface TrainingDatasetOptions {
  negativeSamplingRatio: number
  seed?: number
  useClassWeight?: boolean
}

function lcgNext(state: number): number {
  return (state * 1664525 + 1013904223) & 0xffffffff
}

export function buildTrainingDataset(
  clients: ClientDTO[],
  clientOrderMap: Map<string, Set<string>>,
  productEmbeddingMap: Map<string, number[]>,
  products: ProductDTO[],
  options: TrainingDatasetOptions
): { inputVectors: number[][]; labels: number[] } {
  if (clients.length === 0) return { inputVectors: [], labels: [] }

  const { negativeSamplingRatio, seed, useClassWeight = true } = options
  let rngState = seed ?? Date.now()

  const productsWithEmbeddings = products.filter((p) => productEmbeddingMap.has(p.id))

  const inputVectors: number[][] = []
  const labels: number[] = []

  for (const client of clients) {
    const purchasedIds = clientOrderMap.get(client.id) ?? new Set<string>()

    const purchasedEmbeddings: number[][] = []
    for (const pid of purchasedIds) {
      const emb = productEmbeddingMap.get(pid)
      if (emb) purchasedEmbeddings.push(emb)
    }
    if (purchasedEmbeddings.length === 0) continue

    const clientProfileVector = meanPooling(purchasedEmbeddings)

    const positiveProducts = productsWithEmbeddings.filter((p) => purchasedIds.has(p.id))
    const negativePool = productsWithEmbeddings.filter((p) => !purchasedIds.has(p.id))

    for (const posProduct of positiveProducts) {
      const posEmb = productEmbeddingMap.get(posProduct.id)!
      const positiveCategory = posProduct.category

      // Separate negatives into different category and same category
      const diffCategoryNeg = negativePool.filter((p) => p.category !== positiveCategory)
      const sameCategoryNeg = negativePool.filter((p) => p.category === positiveCategory)

      const selectedNegatives: ProductDTO[] = []
      const hardNegativeCount = Math.min(2, negativeSamplingRatio, diffCategoryNeg.length)

      // Select hard negatives (different category)
      const shuffledDiff = seededSample(diffCategoryNeg, hardNegativeCount, rngState)
      rngState = lcgNext(rngState)
      selectedNegatives.push(...shuffledDiff)

      // Fill remaining slots from same-category or all negatives
      const remaining = negativeSamplingRatio - selectedNegatives.length
      if (remaining > 0) {
        const fillPool = sameCategoryNeg.length > 0 ? sameCategoryNeg : negativePool
        const fillNeg = seededSample(fillPool, remaining, rngState)
        rngState = lcgNext(rngState)
        selectedNegatives.push(...fillNeg)
      }

      // Add positive sample
      inputVectors.push([...posEmb, ...clientProfileVector])
      labels.push(1)

      if (useClassWeight !== false) {
        // Add negative samples
        for (const negProduct of selectedNegatives) {
          const negEmb = productEmbeddingMap.get(negProduct.id)!
          inputVectors.push([...negEmb, ...clientProfileVector])
          labels.push(0)
        }
      } else {
        // Upsampling: duplicate positive sample negativeSamplingRatio times
        for (let i = 0; i < negativeSamplingRatio; i++) {
          inputVectors.push([...posEmb, ...clientProfileVector])
          labels.push(1)
        }
      }
    }
  }

  return { inputVectors, labels }
}

function meanPooling(embeddings: number[][]): number[] {
  const dims = embeddings[0].length
  const mean = new Array<number>(dims).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < dims; i++) mean[i] += emb[i]
  }
  return mean.map((v) => v / embeddings.length)
}

function seededSample<T>(arr: T[], n: number, seed: number): T[] {
  if (n >= arr.length) return [...arr]
  const result: T[] = []
  const indices = Array.from({ length: arr.length }, (_, i) => i)
  let state = seed

  for (let i = 0; i < n; i++) {
    state = lcgNext(state)
    const j = i + (Math.abs(state) % (indices.length - i))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
    result.push(arr[indices[i]])
  }

  return result
}
