import type { ClientDTO, ProductDTO } from './training-utils.js'

export class ApiServiceUnavailableError extends Error {
  readonly statusCode = 503
  constructor() {
    super('API Service unavailable. Cannot fetch training data.')
    this.name = 'ApiServiceUnavailableError'
  }
}

export interface OrderItemDTO {
  productId: string
  quantity: number
}

export interface OrderDTO {
  id: string
  clientId: string
  items: OrderItemDTO[]
  /** ISO string from API, or legacy Jackson array form */
  orderDate?: unknown
}

export function normalizeOrderDateFromApi(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const ms = Date.parse(raw)
    return Number.isNaN(ms) ? null : new Date(ms).toISOString()
  }
  if (Array.isArray(raw) && raw.length >= 3) {
    const y = Number(raw[0])
    const mo = Number(raw[1])
    const d = Number(raw[2])
    const h = raw.length > 3 ? Number(raw[3]) : 0
    const mi = raw.length > 4 ? Number(raw[4]) : 0
    const s = raw.length > 5 ? Number(raw[5]) : 0
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString()
  }
  return null
}

const PAGE_SIZE = 100

interface PageResponse<T> {
  items: T[]
  totalPages: number
}

async function fetchAllPages<T>(
  baseUrl: string,
  fetchOrThrow: (url: string) => Promise<unknown>
): Promise<T[]> {
  const firstPage = (await fetchOrThrow(`${baseUrl}&page=0&size=${PAGE_SIZE}`)) as PageResponse<T>
  const allItems: T[] = [...firstPage.items]

  for (let p = 1; p < firstPage.totalPages; p++) {
    const page = (await fetchOrThrow(`${baseUrl}&page=${p}&size=${PAGE_SIZE}`)) as PageResponse<T>
    allItems.push(...page.items)
  }

  return allItems
}

export async function fetchTrainingData(apiServiceUrl: string): Promise<{
  clients: ClientDTO[]
  products: ProductDTO[]
  orders: OrderDTO[]
}> {
  const TRAINING_HEADERS = { 'Cache-Control': 'no-cache' } as const

  const fetchOrThrow = async (url: string): Promise<unknown> => {
    let res: Response
    try {
      res = await fetch(url, { headers: TRAINING_HEADERS })
    } catch {
      throw new ApiServiceUnavailableError()
    }
    if (!res.ok) {
      if (res.status >= 500) throw new ApiServiceUnavailableError()
      const body = await res.text()
      throw new Error(`API error ${res.status}: ${body}`)
    }
    return res.json()
  }

  const [clients, products] = await Promise.all([
    fetchAllPages<ClientDTO>(`${apiServiceUrl}/api/v1/clients?`, fetchOrThrow),
    fetchAllPages<ProductDTO>(`${apiServiceUrl}/api/v1/products?`, fetchOrThrow),
  ])

  console.log(`[training-data-fetch] Fetched ${clients.length} clients, ${products.length} products`)

  const ordersArrays = await Promise.all(
    clients.map(async (c) => {
      const orders = await fetchAllPages<OrderDTO>(
        `${apiServiceUrl}/api/v1/clients/${c.id}/orders?`,
        fetchOrThrow
      )
      return orders.map((o) => ({ ...o, clientId: c.id }))
    })
  )

  const orders = ordersArrays.flat()
  console.log(`[training-data-fetch] Fetched ${orders.length} orders total`)

  return { clients, products, orders }
}
