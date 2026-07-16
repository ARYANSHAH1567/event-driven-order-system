import cors from "@fastify/cors";
import { type Logger, type MessageBus, metricsContentType, metricsText } from "@ordersys/shared";
import Fastify from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import { OrderStatus, prisma } from "./db.js";
import { Prisma } from "./generated/prisma/index.js";
import { enqueueOutbox } from "./outbox.js";

const mgmtAuth =
  "Basic " + Buffer.from(`${config.mgmt.user}:${config.mgmt.pass}`).toString("base64");

interface RabbitQueue {
  name: string;
  messages: number;
  messages_ready: number;
  messages_unacknowledged: number;
  consumers: number;
}

const CreateOrderSchema = z.object({
  customerId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        sku: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      }),
    )
    .min(1),
  address: z.record(z.unknown()).optional(),
  currency: z.string().default("USD"),
  simulate: z
    .object({
      outOfStock: z.boolean().optional(),
      paymentFailure: z.boolean().optional(),
    })
    .optional(),
});

export function buildServer(bus: MessageBus, logger: Logger) {
  const app = Fastify({ loggerInstance: logger });
  void app.register(cors, { origin: true });

  app.get("/healthz", async () => ({ status: "ok", service: "order-service" }));
  app.get("/metrics", async (_req, reply) => {
    reply.header("content-type", metricsContentType);
    return metricsText();
  });

  // ---- Create an order → kicks off the saga (published via the outbox) ----
  app.post("/api/orders", async (request, reply) => {
    const parsed = CreateOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const { customerId, items, address, currency, simulate } = parsed.data;
    const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    // Order row, its timeline entry, and the outbox event all commit together.
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          customerId,
          currency,
          totalAmount,
          address: address as Prisma.InputJsonValue | undefined,
          items: { create: items },
          events: {
            create: {
              type: "order.created",
              producer: "order-service",
              payload: { customerId, items, totalAmount, currency },
            },
          },
        },
        include: { items: true },
      });
      await enqueueOutbox(tx, {
        aggregateId: created.id,
        type: "order.created",
        // correlationId = order id → the whole journey is traceable by order id.
        correlationId: created.id,
        data: { orderId: created.id, customerId, items, totalAmount, currency, simulate },
      });
      return created;
    });

    logger.info({ orderId: order.id, totalAmount }, "order created");
    return reply.status(201).send(order);
  });

  // ---- List orders ----
  app.get("/api/orders", async (request) => {
    const query = request.query as { status?: string; limit?: string };
    const where =
      query.status && query.status in OrderStatus ? { status: query.status as OrderStatus } : {};
    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(query.limit ?? 50), 200),
      include: { items: true },
    });
    return { orders };
  });

  // ---- Order detail + full event timeline ----
  app.get("/api/orders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true, events: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) return reply.status(404).send({ error: "not_found" });
    return order;
  });

  // ---- BFF: catalogue proxied from the inventory service ----
  app.get("/api/catalog", async (_req, reply) => {
    try {
      const res = await fetch(`${config.services.inventory}/api/products`);
      return await res.json();
    } catch {
      return reply.status(502).send({ error: "inventory_unavailable", products: [] });
    }
  });

  // ---- Ops: aggregate health of every service ----
  app.get("/api/ops/health", async () => {
    const targets = {
      "order-service": `http://localhost:${config.port}`,
      "inventory-service": config.services.inventory,
      "payment-service": config.services.payment,
      "shipping-service": config.services.shipping,
      "notification-service": config.services.notification,
    };
    const checks = await Promise.all(
      Object.entries(targets).map(async ([name, url]) => {
        try {
          const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2000) });
          return { name, status: res.ok ? "up" : "down" };
        } catch {
          return { name, status: "down" };
        }
      }),
    );
    return { services: checks };
  });

  // ---- Ops: queue depths (from the RabbitMQ management API) ----
  app.get("/api/ops/queues", async (_req, reply) => {
    try {
      const res = await fetch(`${config.mgmt.url}/api/queues`, {
        headers: { authorization: mgmtAuth },
      });
      const queues = (await res.json()) as RabbitQueue[];
      return {
        queues: queues
          .filter((q) => !q.name.startsWith("amq."))
          .map((q) => ({
            name: q.name,
            messages: q.messages ?? 0,
            ready: q.messages_ready ?? 0,
            unacked: q.messages_unacknowledged ?? 0,
            consumers: q.consumers ?? 0,
            isDlq: q.name.endsWith(".dlq"),
          })),
      };
    } catch {
      return reply.status(502).send({ error: "rabbitmq_mgmt_unavailable", queues: [] });
    }
  });

  // ---- Ops: replay dead-lettered messages for a queue ----
  app.post("/api/ops/dlq/:queue/replay", async (request) => {
    const { queue } = request.params as { queue: string };
    const base = queue.replace(/\.dlq$/, "");
    const replayed = await bus.replayDeadLettered(base);
    return { queue: base, replayed };
  });

  return app;
}
