import { normalizeOrderDateFromApi, type OrderDTO } from './training-data-fetch.js'

/**
 * Per-client purchase sets and ISO timestamps for P2 profile pooling (training snapshot).
 * Only orders with parsable `orderDate` contribute (aligned with confirmed-purchase temporal signal).
 */
export interface PurchaseTemporalIndex {
  clientPurchasedProducts: Map<string, Set<string>>
  /** Key `${clientId}::${productId}` → max purchase instant ISO in snapshot */
  lastPurchaseIsoByClientProduct: Map<string, string>
  /** Max normalized order date per client in snapshot (= T_ref^(c) for training). */
  tRefIsoByClient: Map<string, string>
}

function maxIso(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b
}

export function buildClientPurchaseTemporalMap(orders: OrderDTO[]): PurchaseTemporalIndex {
  const clientPurchasedProducts = new Map<string, Set<string>>()
  const lastPurchaseIsoByClientProduct = new Map<string, string>()
  const tRefIsoByClient = new Map<string, string>()

  for (const order of orders) {
    const iso = normalizeOrderDateFromApi(order.orderDate)
    if (!iso) continue

    const cid = order.clientId
    if (!clientPurchasedProducts.has(cid)) clientPurchasedProducts.set(cid, new Set())

    const prevRef = tRefIsoByClient.get(cid)
    tRefIsoByClient.set(cid, prevRef ? maxIso(iso, prevRef) : iso)

    for (const item of order.items) {
      const pid = item.productId
      clientPurchasedProducts.get(cid)!.add(pid)
      const key = `${cid}::${pid}`
      const prev = lastPurchaseIsoByClientProduct.get(key)
      lastPurchaseIsoByClientProduct.set(key, prev ? maxIso(iso, prev) : iso)
    }
  }

  return { clientPurchasedProducts, lastPurchaseIsoByClientProduct, tRefIsoByClient }
}
