import type {
  TrainingStatus,
  RecommendationResult,
  RAGResponse,
  SearchResult,
} from '../../types/index.js'

export const fixtureRecommendResponse = {
  clientId: 'client-test-001',
  recommendations: [
    {
      id: 'prod-001',
      name: 'Test Product A',
      category: 'beverages',
      price: 12.99,
      sku: 'SKU-001',
      finalScore: 0.85,
      neuralScore: 0.9,
      semanticScore: 0.75,
      matchReason: 'neural',
      eligible: true,
      eligibilityReason: 'eligible',
      suppressionUntil: null,
      lastPurchaseAt: null,
    } as RecommendationResult,
    {
      id: 'prod-002',
      name: 'Test Product B',
      category: 'snacks',
      price: 5.49,
      sku: 'SKU-002',
      finalScore: 0.72,
      neuralScore: 0.6,
      semanticScore: 0.9,
      matchReason: 'semantic',
      eligible: true,
      eligibilityReason: 'eligible',
      suppressionUntil: null,
      lastPurchaseAt: null,
    } as RecommendationResult,
  ],
}

export const fixtureRAGResponse: RAGResponse = {
  answer: 'Based on the product catalog, we recommend beverages for hot weather.',
  sources: [
    { id: 'prod-001', name: 'Test Product A', score: 0.92 },
    { id: 'prod-002', name: 'Test Product B', score: 0.81 },
  ],
}

export const fixtureSearchResponse = {
  products: [
    {
      id: 'prod-001',
      name: 'Test Product A',
      description: 'A refreshing beverage',
      category: 'beverages',
      price: 12.99,
      sku: 'SKU-001',
      score: 0.88,
    } as SearchResult & { score: number },
    {
      id: 'prod-002',
      name: 'Test Product B',
      description: 'A crunchy snack',
      category: 'snacks',
      price: 5.49,
      sku: 'SKU-002',
      score: 0.74,
    } as SearchResult & { score: number },
  ],
}

export const fixtureModelStatusTrained: TrainingStatus = {
  status: 'trained',
  trainedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  finalLoss: 0.12,
  finalAccuracy: 0.93,
  trainingSamples: 1040,
  staleDays: 2,
  syncedAt: new Date().toISOString(),
  precisionAt5: 0.6,
}

export const fixtureModelStatusUntrained: TrainingStatus = {
  status: 'untrained',
  staleDays: null,
}
