/**
 * Offline rows for training the profile attention Dense(1) head (M21 attention_learned JSON).
 * Labels: purchase embedding = 1 if the client has at least one strictly later purchase in the
 * snapshot (proxy for "still active / followed by more behaviour"); negatives sampled from
 * products-with-embedding the client never bought.
 */
import { normalizeOrderDateFromApi, type OrderDTO } from '../services/training-data-fetch.js'

export interface AttentionPoolingTrainRow {
  embedding: number[]
  label: number
}

interface ClientEvent {
  clientId: string
  productId: string
  orderIso: string
}

function lcgState(seed: number): { s: number } {
  return { s: (seed >>> 0) || 1 }
}

function lcgNext(state: { s: number }): number {
  state.s = (state.s * 1664525 + 1013904223) >>> 0
  return state.s
}

function pickNegativeProductId(
  productIdsWithEmb: string[],
  clientProducts: Set<string>,
  rng: { s: number }
): string | null {
  if (productIdsWithEmb.length === 0) return null
  for (let attempt = 0; attempt < 80; attempt++) {
    const idx = lcgNext(rng) % productIdsWithEmb.length
    const pid = productIdsWithEmb[idx]!
    if (!clientProducts.has(pid)) return pid
  }
  return null
}

function collectSortedClientEvents(orders: OrderDTO[]): Map<string, ClientEvent[]> {
  const raw: ClientEvent[] = []
  for (const order of orders) {
    const iso = normalizeOrderDateFromApi(order.orderDate)
    if (!iso) continue
    for (const item of order.items) {
      raw.push({ clientId: order.clientId, productId: item.productId, orderIso: iso })
    }
  }
  const byClient = new Map<string, ClientEvent[]>()
  for (const e of raw) {
    if (!byClient.has(e.clientId)) byClient.set(e.clientId, [])
    byClient.get(e.clientId)!.push(e)
  }
  for (const evs of byClient.values()) {
    evs.sort((a, b) => {
      const t = Date.parse(a.orderIso) - Date.parse(b.orderIso)
      return t !== 0 ? t : a.productId.localeCompare(b.productId)
    })
  }
  return byClient
}

export function buildAttentionPoolingBinaryDataset(
  orders: OrderDTO[],
  productEmbeddingMap: Map<string, number[]>,
  options: { negativesPerPositive: number; seed: number }
): AttentionPoolingTrainRow[] {
  const { negativesPerPositive, seed } = options
  const byClient = collectSortedClientEvents(orders)
  const productIdsWithEmb = [...productEmbeddingMap.keys()]
  const rng = lcgState(seed)
  const rows: AttentionPoolingTrainRow[] = []

  for (const [, evs] of byClient) {
    if (evs.length < 2) continue
    const purchased = new Set(evs.map((e) => e.productId))

    for (let i = 0; i < evs.length - 1; i++) {
      const emb = productEmbeddingMap.get(evs[i]!.productId)
      if (!emb) continue
      rows.push({ embedding: [...emb], label: 1 })

      for (let k = 0; k < negativesPerPositive; k++) {
        const negId = pickNegativeProductId(productIdsWithEmb, purchased, rng)
        if (!negId) continue
        const negEmb = productEmbeddingMap.get(negId)
        if (!negEmb) continue
        rows.push({ embedding: [...negEmb], label: 0 })
      }
    }
  }

  return rows
}
