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

/** Full country catalog row for M16 eligibility + vitrine (embedding optional). */
export interface CatalogProductRow {
  id: string
  name: string
  category: string
  price: number
  sku: string
  embedding: number[] | null
}

export type MatchReason = 'neural' | 'semantic' | 'hybrid'

export type EligibilityReasonCode =
  | 'eligible'
  | 'recently_purchased'
  | 'no_embedding'
  | 'in_cart'

/** M17 ADR-063 — effective hybrid / recency weights for this response (single source of truth for UI). */
export interface RankingConfig {
  neuralWeight: number
  semanticWeight: number
  recencyRerankWeight: number
  /** M17 P2 — profile pooling mode (`mean` | `exp`). */
  profilePoolingMode?: 'mean' | 'exp'
  /** M17 P2 — half-life in days when mode is `exp`. */
  profilePoolingHalfLifeDays?: number
}

export interface RecommendationResult {
  id: string
  name: string
  category: string
  price: number
  sku: string
  finalScore: number | null
  neuralScore: number | null
  semanticScore: number | null
  matchReason: MatchReason | null
  /** M17 P1 — max cosine to recent-purchase anchor embeddings; present when `RECENCY_RERANK_WEIGHT` > 0. */
  recencySimilarity?: number | null
  /** M17 P1 — sort key for ranked block: `finalScore + weight * recencySimilarity`; present when recency re-rank is active. */
  rankScore?: number | null
  /** ADR-063 — `neuralWeight × neuralScore` for scored eligible rows. */
  hybridNeuralTerm?: number
  /** ADR-063 — `semanticWeight × semanticScore`. */
  hybridSemanticTerm?: number
  /** ADR-063 — `recencyRerankWeight × recencySimilarity`. */
  recencyBoostTerm?: number
  eligible: boolean
  eligibilityReason: EligibilityReasonCode
  suppressionUntil: string | null
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
