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
