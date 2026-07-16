# Event-Driven Order & Fulfillment System

A distributed, event-driven order-processing platform that models how real
e-commerce backends work: independent microservices communicating
**asynchronously** over RabbitMQ, coordinating a multi-step workflow with the
**saga pattern**, and staying correct under failures, retries, and duplicate
deliveries — with an operations dashboard and full observability.

Built to demonstrate the backend/system-design concepts that come up in
interviews, end to end.

## What it demonstrates

- **Choreographed microservices** — 5 services, no synchronous coupling in the workflow
- **Saga pattern** with **compensating transactions** (release stock / refund payment)
- **Transactional outbox** — no dual-write between the DB and the broker
- **Idempotent consumers** — at-least-once delivery + idempotency = effectively-once
- **Retries with exponential backoff + jitter** and **dead-letter queues** (with replay)
- **Observability** — Prometheus metrics, Grafana dashboards, correlation-ID tracing, structured logs
- **Polyglot** — four TypeScript services + one Python (FastAPI) service on the same event bus
- **Containerised & orchestrated** — Docker Compose for local, Kubernetes manifests with an HPA

## Architecture

```
        ┌────────────────────┐
        │  Next.js dashboard │  (orders, timeline, health, DLQ replay)
        └─────────┬──────────┘
                  │ HTTP (BFF)
        ┌─────────▼──────────┐   order.created
        │   Order Service    │──────────────┬──────────────┐
        │  · REST API        │              ▼              ▼
        │  · saga coordinator│      ┌──────────────┐ ┌──────────────┐
        │  · outbox relay    │      │  Inventory   │ │   Payment    │
        └────▲───────────────┘      │   Service    │ │   Service    │
             │ inventory.reserved   └──────┬───────┘ └──────┬───────┘
             │ payment.succeeded           │                │
             │ inventory.rejected   ┌──────▼────────────────▼──────┐
             │ payment.failed       │  RabbitMQ topic exchange     │
             │ shipment.*           │  "orders.topic" (+retry/DLQ) │
             └──────────────────────┴──────┬────────────────┬──────┘
                                            ▼                ▼
                                   ┌──────────────┐ ┌────────────────┐
                                   │  Shipping    │ │  Notification  │
                                   │  Service     │ │ Service (Py)   │
                                   └──────────────┘ └────────────────┘

  Postgres (one DB per service) · Redis · Prometheus + Grafana
```

**Order lifecycle:** `PENDING → CONFIRMED → SHIPPED → DELIVERED`, or
`PENDING → CANCELLED` (with compensation). The Order service confirms only once
**both** the inventory and payment legs succeed; if either fails it emits
`order.cancelled`, which triggers the other services' compensating transactions.

## Tech stack

| Concern | Choice |
|---|---|
| Services | TypeScript on Node 22 (Fastify) · one Python service (FastAPI) |
| Messaging | RabbitMQ — durable topic exchange, per-queue retry + DLQ |
| Data | PostgreSQL, one database per service (Prisma / asyncpg) |
| Cache / idempotency | Redis + per-service `processed_messages` ledger |
| Dashboard | Next.js (App Router), Tailwind, TanStack Query |
| Observability | Prometheus + Grafana, `pino` / `structlog` JSON logs |
| Packaging | pnpm workspaces, Docker Compose, Kubernetes |

## Running it

**Prerequisites:** Docker Desktop.

```bash
docker compose up --build
```

| Surface | URL |
|---|---|
| Ops dashboard | http://localhost:3000 |
| Order API | http://localhost:4001 |
| RabbitMQ management | http://localhost:15672 (guest / guest) |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin / admin) |

### Try it from the UI

1. Open the dashboard → **New order**, pick items, **Place order**.
2. Watch it move `PENDING → CONFIRMED → SHIPPED → DELIVERED` on the orders list,
   and open it to see the full **event timeline**.
3. Create another order with a **failure toggle** on (out-of-stock or payment
   declined) and watch it **cancel and compensate**.

### Or from the API

```bash
curl -sX POST http://localhost:4001/api/orders -H 'content-type: application/json' -d '{
  "customerId": "cust-1",
  "items": [{ "productId": "prod-espresso", "sku": "ESP-01", "quantity": 1, "unitPrice": 24.0 }]
}' | jq

curl http://localhost:4001/api/orders/<ORDER_ID> | jq   # status + timeline
```

## Reliability patterns — where to look

| Pattern | File |
|---|---|
| Saga coordination + compensation | `services/order-service/src/saga.ts` |
| Transactional outbox + relay | `services/order-service/src/outbox.ts` |
| Idempotent consumer | `services/*/src/idempotency.ts` |
| Retry (backoff+jitter) → DLQ → replay | `packages/shared/src/bus.ts` |
| Event contract (typed + validated) | `packages/shared/src/events.ts` |

## Testing

```bash
pnpm test                 # unit tests (event contract) — no infra needed
RUN_INTEGRATION=1 pnpm test   # + Testcontainers integration test (needs Docker)
```

The integration test (`tests/integration/bus.test.ts`) spins up a real RabbitMQ
and asserts the retry → dead-letter → replay path.

**Chaos check (manual):** with the stack up, `docker compose stop payment-service`,
place an order (it parks in `PENDING`), then `docker compose start payment-service`
— the durable queues + outbox drive it to completion. Kill any consumer mid-flow
and no order is lost.

## Local development (infra in Docker, services on host)

```bash
docker compose up -d postgres rabbitmq redis
cp .env.example .env
pnpm install && pnpm prisma:generate
pnpm --filter @ordersys/order-service db:push && pnpm dev:order   # + dev:inventory, dev:payment, dev:shipping
cd dashboard && npm install && npm run dev
```

## Kubernetes

Manifests + instructions in [`k8s/`](./k8s) — Deployment/Service per service,
config & secrets, health probes, and a HorizontalPodAutoscaler on the order
service.

## Repository layout

```
packages/shared/         Event catalog, MessageBus (retry/DLQ), metrics, logger
services/order-service/     REST API · saga coordinator · outbox · BFF/ops
services/inventory-service/ Stock reservation + release compensation
services/payment-service/   Charge + refund compensation
services/shipping-service/  Shipment dispatch → delivery
services/notification-service/  Python/FastAPI consumer (polyglot)
dashboard/               Next.js operations console
infra/                   Postgres init, Prometheus, Grafana provisioning
k8s/                     Kubernetes manifests
tests/integration/       Testcontainers integration test
```
