import { v5 as uuidv5 } from 'uuid';
import { Client } from './clients';
import { Product } from './products';

// Stable namespace for deterministic UUID generation
const SEED_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface Order {
  id: string;
  client_id: string;
  order_date: string;
  total: number;
  items: OrderItem[];
}

const QUANTITIES = [1, 2, 3, 5, 8, 10, 2, 4, 6, 3, 7, 1, 5, 2, 9];

function getProductsForCountry(products: Product[], countryCode: string): Product[] {
  return products.filter((p) => p.available_in.includes(countryCode));
}

export function generateOrders(clients: Client[], products: Product[]): Order[] {
  const orders: Order[] = [];
  const nowMs = Date.now();

  clients.forEach((client, clientIdx) => {
    const availableProducts = getProductsForCountry(products, client.country_code);
    if (availableProducts.length === 0) return;

    // Each client generates 5–8 orders deterministically
    const orderCount = 5 + (clientIdx % 4);

    for (let orderIdx = 0; orderIdx < orderCount; orderIdx++) {
      const orderId = uuidv5(`order:${client.id}:${orderIdx}`, SEED_NAMESPACE);
      // Spread history into the past; keep the last few orders within ~0–20 days so M16
      // RECENT_PURCHASE_WINDOW_DAYS can surface suppressions in seeded demos.
      const recencyBucket = orderCount - 1 - orderIdx;
      const daysAgo = recencyBucket < 4 ? (clientIdx + recencyBucket * 2) % 6 : 14 + ((clientIdx * 5 + orderIdx * 7) % 120);
      const orderDate = new Date(nowMs - daysAgo * 86400000).toISOString();

      // 2–5 items per order, deterministically selected
      const itemCount = 2 + (orderIdx % 4);
      const selectedProducts: Product[] = [];
      const segment = client.segment;
      const preferredCategories =
        segment === 'food_service'
          ? ['beverages', 'food']
          : segment === 'wholesale'
            ? ['food', 'beverages', 'cleaning']
            : ['beverages', 'food', 'snacks', 'personal_care', 'cleaning'];

      const pool = [...availableProducts].sort((a, b) => {
        const ra = preferredCategories.indexOf(a.category);
        const rb = preferredCategories.indexOf(b.category);
        const pa = ra === -1 ? 99 : ra;
        const pb = rb === -1 ? 99 : rb;
        if (pa !== pb) return pa - pb;
        return a.id.localeCompare(b.id);
      });

      // Recompra bias: repeat one product from the previous order when possible
      const prevOrder = orders.filter((o) => o.client_id === client.id).pop();
      const repeatCandidate = prevOrder?.items[0]?.product_id;
      const repeatProduct = repeatCandidate
        ? availableProducts.find((p) => p.id === repeatCandidate)
        : undefined;

      if (repeatProduct && !selectedProducts.find((sp) => sp.id === repeatProduct.id)) {
        selectedProducts.push(repeatProduct);
      }

      for (let i = 0; i < itemCount; i++) {
        const productIdx = (clientIdx * 7 + orderIdx * 3 + i * 5) % pool.length;
        const p = pool[productIdx];
        if (!selectedProducts.find((sp) => sp.id === p.id)) {
          selectedProducts.push(p);
        }
      }

      // Ensure at least 2 unique items
      if (selectedProducts.length < 2) {
        for (let i = 0; selectedProducts.length < 2 && i < availableProducts.length; i++) {
          if (!selectedProducts.find((sp) => sp.id === availableProducts[i].id)) {
            selectedProducts.push(availableProducts[i]);
          }
        }
      }

      const items: OrderItem[] = selectedProducts.map((p, itemIdx) => {
        const quantity = QUANTITIES[(clientIdx + orderIdx + itemIdx) % QUANTITIES.length];
        return {
          id: uuidv5(`item:${orderId}:${p.id}:${itemIdx}`, SEED_NAMESPACE),
          product_id: p.id,
          quantity,
          unit_price: p.price,
        };
      });

      const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

      orders.push({
        id: orderId,
        client_id: client.id,
        order_date: orderDate,
        total: Math.round(total * 100) / 100,
        items,
      });
    }
  });

  return orders;
}
