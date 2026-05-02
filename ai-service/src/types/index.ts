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

/** M21 T1 — training-time loss branch (`NEURAL_LOSS_MODE`). */
export type NeuralLossMode = 'bce' | 'pairwise'

/** M21 T1 / ADR-071 — persisted neural output contract for inference + eval. */
export type NeuralHeadKind = 'bce_sigmoid' | 'ranking_linear'

/** M22 — checkpoint architecture marker (manifest sidecar when `m22`). */
export type ModelArchitectureKind = 'baseline' | 'm22'

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
  /** M21 — active inference head for the loaded model (`neural-head.json` or legacy default). */
  neuralHeadKind?: NeuralHeadKind
}

export interface TrainingMetadata {
  trainedAt: string
  finalLoss: number
  finalAccuracy: number
  trainingSamples: number
  durationMs: number
  syncedAt?: string
  precisionAt5?: number
  /** M21 — absent implies legacy `bce_sigmoid` (sigmoid last layer). */
  neuralHeadKind?: NeuralHeadKind
  /** M22 — persisted checkpoint kind; absent implies baseline 768-MLP. */
  modelArchitecture?: ModelArchitectureKind
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
  neuralHeadKind: NeuralHeadKind
  /** M22 — sidecar JSON next to promoted checkpoint; null when baseline training. */
  m22ItemManifest?: import('../ml/m22Manifest.js').M22ItemManifest | null
  modelArchitecture?: ModelArchitectureKind
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
  /** M17 P2 — profile pooling mode (`mean` | `exp` | `attention_light` | `attention_learned`). */
  profilePoolingMode?: 'mean' | 'exp' | 'attention_light' | 'attention_learned'
  /** M17 P2 / M21 A — half-life in days for `exp` and for recency scale in attention modes. */
  profilePoolingHalfLifeDays?: number
  /** M21 A — softmax temperature when mode is `attention_light` or `attention_learned`; `null` means uniform weights (mean over window). */
  profilePoolingAttentionTemperature?: number | null
  /** M21 A — max purchases in the attention window (0 = unlimited). */
  profilePoolingAttentionMaxEntries?: number
  /** M21 — `true` when `PROFILE_POOLING_MODE=attention_learned` (weights use JSON `w`/`b`/`λ`). */
  profilePoolingAttentionLearned?: boolean
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
