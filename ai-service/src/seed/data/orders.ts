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

const ORDER_DATES = [
  '2024-03-01T10:00:00Z',
  '2024-03-10T11:30:00Z',
  '2024-03-20T09:15:00Z',
  '2024-04-01T14:00:00Z',
  '2024-04-10T16:00:00Z',
  '2024-04-20T08:45:00Z',
  '2024-05-01T12:00:00Z',
  '2024-05-10T10:30:00Z',
  '2024-05-20T15:00:00Z',
  '2024-06-01T09:00:00Z',
  '2024-06-10T11:00:00Z',
  '2024-06-20T13:30:00Z',
  '2024-07-01T10:00:00Z',
  '2024-07-10T14:00:00Z',
  '2024-07-20T09:30:00Z',
];

const QUANTITIES = [1, 2, 3, 5, 8, 10, 2, 4, 6, 3, 7, 1, 5, 2, 9];

function getProductsForCountry(products: Product[], countryCode: string): Product[] {
  return products.filter((p) => p.available_in.includes(countryCode));
}

export function generateOrders(clients: Client[], products: Product[]): Order[] {
  const orders: Order[] = [];

  clients.forEach((client, clientIdx) => {
    const availableProducts = getProductsForCountry(products, client.country_code);
    if (availableProducts.length === 0) return;

    // Each client generates 5–8 orders deterministically
    const orderCount = 5 + (clientIdx % 4);

    for (let orderIdx = 0; orderIdx < orderCount; orderIdx++) {
      const orderId = uuidv5(`order:${client.id}:${orderIdx}`, SEED_NAMESPACE);
      const orderDate = ORDER_DATES[orderIdx % ORDER_DATES.length];

      // 2–5 items per order, deterministically selected
      const itemCount = 2 + (orderIdx % 4);
      const selectedProducts: Product[] = [];
      for (let i = 0; i < itemCount; i++) {
        const productIdx = (clientIdx * 7 + orderIdx * 3 + i * 5) % availableProducts.length;
        const p = availableProducts[productIdx];
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
