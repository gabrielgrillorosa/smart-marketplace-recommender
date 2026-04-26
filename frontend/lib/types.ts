export interface ProductSummary {
  id: string;
  name: string;
  category: string;
}

export interface Client {
  id: string;
  name: string;
  segment: string;
  country: string;
  totalOrders: number;
  recentProducts: ProductSummary[];
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

export interface RecommendationResult {
  product: Product;
  finalScore: number;
  neuralScore?: number;
  semanticScore?: number;
  matchReason: 'semantic' | 'neural' | 'hybrid';
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
  status: 'queued' | 'running' | 'done' | 'failed';
  epoch: number;
  totalEpochs: number;
  loss: number | null;
  eta: number | null;
}

export interface ModelStatusResponse {
  status?: string;
  trainedAt?: string;
  finalLoss?: number;
  finalAccuracy?: number;
  trainingSamples?: number;
  precisionAt5?: number;
}
