/**
 * Integration test for the MessageBus reliability path (retry → dead-letter →
 * replay). Requires Docker (spins up a real RabbitMQ via Testcontainers), so it
 * is skipped by default. Run it with:
 *
 *   RUN_INTEGRATION=1 pnpm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MessageBus, createLogger } from "@ordersys/shared";

const ENABLED = process.env.RUN_INTEGRATION === "1";

describe.skipIf(!ENABLED)("MessageBus reliability (Testcontainers)", () => {
  let container: { getAmqpUrl: () => string; stop: () => Promise<unknown> };
  let bus: MessageBus;
  const logger = createLogger("bus-test");

  beforeAll(async () => {
    // Dynamic import so the default (skipped) run needs neither Docker nor the
    // testcontainers dependency installed.
    const { RabbitMQContainer } = await import("@testcontainers/rabbitmq");
    container = (await new RabbitMQContainer("rabbitmq:3.13-management-alpine").start()) as never;
    bus = new MessageBus({ url: container.getAmqpUrl(), producer: "bus-test", logger });
    await bus.connect();
  }, 120_000);

  afterAll(async () => {
    await bus?.close();
    await container?.stop();
  });

  it("dead-letters a message after exhausting retries, then replays it", async () => {
    const queue = "test.always-fails";
    let attempts = 0;

    await bus.subscribe({
      queue,
      routingKeys: ["order.created"],
      maxRetries: 1, // 1 retry → 2 attempts, then DLQ
      handler: async () => {
        attempts += 1;
        throw new Error("boom");
      },
    });

    await bus.publish("order.created", {
      orderId: "o1",
      customerId: "c1",
      items: [{ productId: "p1", sku: "S1", quantity: 1, unitPrice: 1 }],
      totalAmount: 1,
      currency: "USD",
    });

    // Wait for the initial attempt + one backed-off retry to land on the DLQ.
    await new Promise((r) => setTimeout(r, 6000));
    expect(attempts).toBeGreaterThanOrEqual(2);

    const replayed = await bus.replayDeadLettered(queue);
    expect(replayed).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
