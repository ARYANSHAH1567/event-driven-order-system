export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

export type OrderStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "SHIPPED" | "DELIVERED";

export interface OrderItem {
  id: string;
  productId: string;
  sku: string;
  quantity: number;
  unitPrice: string;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  totalAmount: string;
  currency: string;
  inventoryReserved: boolean;
  paymentSucceeded: boolean;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}

export interface OrderEvent {
  id: string;
  type: string;
  producer: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface OrderDetail extends Order {
  items: OrderItem[];
  events: OrderEvent[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: string;
  inventory: { available: number; reserved: number } | null;
}

export interface QueueInfo {
  name: string;
  messages: number;
  ready: number;
  unacked: number;
  consumers: number;
  isDlq: boolean;
}

export interface HealthInfo {
  name: string;
  status: "up" | "down";
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  orders: (status?: string) =>
    get<{ orders: Order[] }>(`/api/orders${status ? `?status=${status}` : ""}`),
  order: (id: string) => get<OrderDetail>(`/api/orders/${id}`),
  catalog: () => get<{ products: Product[] }>(`/api/catalog`),
  health: () => get<{ services: HealthInfo[] }>(`/api/ops/health`),
  queues: () => get<{ queues: QueueInfo[] }>(`/api/ops/queues`),

  createOrder: async (body: unknown): Promise<Order> => {
    const res = await fetch(`${API}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`create order → ${res.status}`);
    return res.json();
  },

  replayDlq: async (queue: string): Promise<{ replayed: number }> => {
    const res = await fetch(`${API}/api/ops/dlq/${queue}/replay`, { method: "POST" });
    if (!res.ok) throw new Error(`replay → ${res.status}`);
    return res.json();
  },
};
