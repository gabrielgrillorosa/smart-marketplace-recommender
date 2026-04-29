export interface Product {
  id: string
  name: string
  description: string
  category: string
  price: number
  sku: string
  embedding?: number[]
}

export interface SearchResult {
  id: string
  name: string
  description: string
  category: string
  price: number
  sku: string
  score: number
  countries: string[]
}

export interface SearchFilters {
  country?: string
  category?: string
}

export interface Source {
  id: string
  name: string
  score: number
}

export interface RAGResponse {
  answer: string
  sources: Source[]
}

// M4 — Neural Recommendation Model types

export type ModelStatus = 'untrained' | 'training' | 'trained'
export type TrainingTrigger = 'checkout' | 'manual'
export type LastTrainingResult = 'promoted' | 'rejected' | 'failed'

export interface LastDecision {
  accepted: boolean
  reason: string
  currentPrecisionAt5: number
  candidatePrecisionAt5: number
  tolerance: number
  currentVersion: string | null
}

export interface TrainingStatus {
  status: ModelStatus
  trainedAt?: string
  startedAt?: string
  progress?: string
  finalLoss?: number
  finalAccuracy?: number
  trainingSamples?: number
  staleDays?: number | null
  staleWarning?: string
  syncedAt?: string
  precisionAt5?: number
  currentVersion?: string | null
  lastTrainingResult?: LastTrainingResult | null
  lastTrainingTriggeredBy?: TrainingTrigger | null
  lastOrderId?: string | null
  lastDecision?: LastDecision | null
}

export interface TrainingMetadata {
  trainedAt: string
  finalLoss: number
  finalAccuracy: number
  trainingSamples: number
  durationMs: number
  syncedAt?: string
  precisionAt5?: number
}

export interface TrainingResult {
  status: 'trained'
  epochs: number
  finalLoss: number
  finalAccuracy: number
  trainingSamples: number
  durationMs: number
  syncedAt: string
  precisionAt5: number
}

export interface ClientProfile {
  id: string
  name: string
  segment: string
  country: string
}

export interface CandidateProduct {
  id: string
  name: string
  category: string
  price: number
  sku: string
  embedding: number[]
}

export type MatchReason = 'neural' | 'semantic' | 'hybrid'

export interface RecommendationResult {
  id: string
  name: string
  category: string
  price: number
  sku: string
  finalScore: number
  neuralScore: number
  semanticScore: number
  matchReason: MatchReason
}

// M7 — Production Readiness types

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export interface TrainingJob {
  jobId: string
  status: JobStatus
  triggeredBy?: TrainingTrigger
  orderId?: string
  epoch?: number
  totalEpochs?: number
  loss?: number
  eta?: string
  error?: string
  startedAt?: string
  completedAt?: string
}

export interface ModelHistoryEntry {
  filename: string
  timestamp: string
  precisionAt5: number
  loss: number
  accepted: boolean
}

export interface EnrichedModelStatus extends TrainingStatus {
  staleDays: number | null
  staleWarning?: string
  currentModel?: string
  models: ModelHistoryEntry[]
  nextScheduledTraining?: string
}
