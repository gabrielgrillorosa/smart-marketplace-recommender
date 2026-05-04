export interface ProductSummary {
  id: string;
  name: string;
  category?: string;
}

export interface Client {
  id: string;
  name: string;
  segment: string;
  country: string;
  totalOrders?: number;
  recentProducts?: ProductSummary[];
}

export interface Product {
  id: string;
  name: string;
  category: string;
  supplier: string;
  countries: string[];
  price: number;
  sku: string;
  similarityScore?: number;
}

export interface ProductDetail extends Product {
  description: string;
}

export interface SearchResult {
  product: Product;
  score: number;
}

export interface RankingConfig {
  neuralWeight: number;
  semanticWeight: number;
  recencyRerankWeight: number;
  /** M17 P2 — ai-service profile pooling (optional). */
  profilePoolingMode?: 'mean' | 'exp';
  profilePoolingHalfLifeDays?: number;
}

export interface RecommendationResult {
  product: Product;
  finalScore: number | null;
  neuralScore?: number | null;
  semanticScore?: number | null;
  matchReason: 'semantic' | 'neural' | 'hybrid';
  /** M17 — present when ai-service recency re-rank is active. */
  recencySimilarity?: number | null;
  rankScore?: number | null;
  hybridNeuralTerm?: number;
  hybridSemanticTerm?: number;
  recencyBoostTerm?: number;
  /** M16 — omitted or true when API does not send eligibility (backward compatible). */
  eligible?: boolean;
  eligibilityReason?: string;
  suppressionUntil?: string | null;
  /** ISO 8601 última compra confirmada (cliente+SKU); ausente ou null se desconhecido. */
  lastPurchaseAt?: string | null;
}

export interface RagChunk {
  productName: string;
  score: number;
  excerpt: string;
}

export interface RagResponse {
  answer: string;
  chunks: RagChunk[];
  durationMs: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  chunks?: RagChunk[];
  isError?: boolean;
}

export type ServiceStatus = 'up' | 'down' | 'unknown';

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Cart {
  cartId: string | null;
  clientId: string;
  items: CartItem[];
  itemCount: number;
}

export interface CheckoutResponse {
  orderId: string;
  expectedTrainingTriggered: boolean;
}

export type JobStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed' | 'network-error';

export interface ModelMetrics {
  precisionAt5: number;
  loss: number;
  epoch: number;
  accuracy?: number;
  trainingSamples?: number;
  trainedAt: string;
}

export interface TrainJobResponse {
  jobId: string;
  status: 'queued';
}

export interface TrainStatusResponse {
  jobId?: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  epoch?: number;
  totalEpochs?: number;
  loss?: number | null;
  eta?: number | null;
  /** Present when terminal (ai-service TrainingJob). */
  error?: string;
  /** Whether governance promoted the new checkpoint to `current`. */
  promoted?: boolean;
}

export interface PurchaseSummary {
  totalOrders: number;
  totalItems: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

export interface ClientDetailResponse {
  id: string;
  name: string;
  segment: string;
  countryCode: string;
  purchaseSummary: PurchaseSummary | null;
}

export interface ClientOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface ClientOrder {
  id: string;
  orderDate: string;
  total: number;
  items: ClientOrderItem[];
}

export interface OrderHistoryResponse {
  items: ClientOrder[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export type ClientProfileLoadState = 'loading' | 'ready' | 'empty' | 'partial' | 'unavailable';

export interface ClientProfileViewModel {
  status: ClientProfileLoadState;
  baseClient: Client;
  totalOrders: number | null;
  totalSpent: number | null;
  lastOrderAt: string | null;
  recentProducts: ProductSummary[];
  warnings: string[];
}

/** M21 — cabeça neural do checkpoint ativo (alinhado com `neural-head.json` / `GET /model/status`). */
export type NeuralHeadKind = 'bce_sigmoid' | 'ranking_linear';

/** M22 — arquitectura do checkpoint activo (vs legado 768-d). */
export type ModelArchitectureKind = 'baseline' | 'm22';
export type NeuralArchProfile = 'baseline' | 'deep64_32' | 'deep128_64' | 'deep256' | 'deep512';
export type ProfilePoolingMode = 'mean' | 'exp' | 'attention_light' | 'attention_learned';

export interface ModelStatusResponse {
  status?: string;
  trainedAt?: string;
  finalLoss?: number;
  finalAccuracy?: number;
  trainingSamples?: number;
  precisionAt5?: number;
  /** Cabeça do modelo em produção; distingue BCE de pairwise sem interpretar só pela loss. */
  neuralHeadKind?: NeuralHeadKind;
  /** Arquitectura neural persistida: baseline (768-d concat) ou M22 (multi-input). */
  modelArchitecture?: ModelArchitectureKind;
  /** Perfil MLP usado no treino que gerou o checkpoint activo. */
  modelArchitectureProfile?: NeuralArchProfile;
  /** Tipo de pooling/attention usado no treino que gerou o checkpoint activo. */
  poolingMode?: ProfilePoolingMode;
  poolingHalfLifeDays?: number;
  poolingAttentionTemperature?: number | null;
  poolingAttentionMaxEntries?: number;
  syncedAt?: string;
  durationMs?: number;
  epochsConfigured?: number;
  epochsEffective?: number;
  currentVersion?: string | null;
  /** Nome do ficheiro de checkpoint activo (quando `VersionedModelStore` está injectado no ai-service). */
  currentModel?: string | null;
  lastTrainingResult?: 'promoted' | 'rejected' | 'failed' | null;
  lastTrainingTriggeredBy?: 'checkout' | 'manual' | null;
  lastOrderId?: string | null;
  lastDecision?: {
    accepted: boolean;
    reason: string;
    currentPrecisionAt5: number;
    candidatePrecisionAt5: number;
    tolerance: number;
    currentVersion: string | null;
  } | null;
}
