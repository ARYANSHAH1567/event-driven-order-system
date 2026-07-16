/**
 * Phase 0 smoke test — proves the plumbing end to end:
 * connect to RabbitMQ, subscribe to a queue, publish an event, receive it.
 *
 * Run infra first:  pnpm infra:up
 * Then:             pnpm hello
 */
import { MessageBus, createLogger, optionalEnv } from "@ordersys/shared";

const logger = createLogger("hello-bus");

async function main() {
  const bus = new MessageBus({
    url: optionalEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),
    producer: "hello-bus",
    logger,
  });
  await bus.connect();

  const received = new Promise<void>((resolve) => {
    void bus.subscribe({
      queue: "hello.smoke-test",
      routingKeys: ["order.created"],
      handler: async (envelope) => {
        logger.info(
          { orderId: envelope.data.orderId, correlationId: envelope.correlationId },
          "✅ received event — the bus works end to end",
        );
        resolve();
      },
    });
  });

  // Give the consumer a moment to bind, then publish.
  await new Promise((r) => setTimeout(r, 500));
  await bus.publish("order.created", {
    orderId: "smoke-test-order",
    customerId: "customer-1",
    items: [{ productId: "p1", sku: "SKU-1", quantity: 1, unitPrice: 9.99 }],
    totalAmount: 9.99,
    currency: "USD",
  });
  logger.info("published order.created — waiting to receive it back…");

  await received;
  await bus.close();
  logger.info("smoke test passed");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "smoke test failed");
  process.exit(1);
});
