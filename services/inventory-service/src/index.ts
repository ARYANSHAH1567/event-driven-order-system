import { MessageBus, createLogger } from "@ordersys/shared";
import { config } from "./config.js";
import { InventoryHandler } from "./handlers.js";
import { isDuplicate, markProcessed } from "./idempotency.js";
import { seedProducts } from "./seed.js";
import { buildServer } from "./server.js";

const logger = createLogger(config.serviceName);

async function main() {
  await seedProducts(logger);

  const bus = new MessageBus({ url: config.rabbitUrl, producer: "inventory-service", logger });
  await bus.connect();

  const handler = new InventoryHandler(bus, logger);
  await bus.subscribe({
    queue: "inventory-service.orders",
    routingKeys: ["order.created", "order.cancelled"],
    handler: async (envelope) => {
      if (await isDuplicate(envelope.messageId)) {
        logger.debug({ messageId: envelope.messageId }, "duplicate — skipped");
        return;
      }
      switch (envelope.type) {
        case "order.created":
          await handler.onOrderCreated(envelope as never);
          break;
        case "order.cancelled":
          await handler.onOrderCancelled(envelope as never);
          break;
      }
      await markProcessed(envelope.messageId, envelope.type);
    },
  });

  const app = buildServer(logger);
  await app.listen({ host: "0.0.0.0", port: config.port });
  logger.info({ port: config.port }, "inventory-service HTTP listening");

  const shutdown = async () => {
    await app.close();
    await bus.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "inventory-service failed to start");
  process.exit(1);
});
