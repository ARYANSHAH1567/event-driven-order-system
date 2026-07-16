import { MessageBus, createLogger } from "@ordersys/shared";
import { config } from "./config.js";
import { ShippingHandler } from "./handlers.js";
import { isDuplicate, markProcessed } from "./idempotency.js";
import { buildServer } from "./server.js";

const logger = createLogger(config.serviceName);

async function main() {
  const bus = new MessageBus({ url: config.rabbitUrl, producer: "shipping-service", logger });
  await bus.connect();

  const handler = new ShippingHandler(bus, logger);
  await bus.subscribe({
    queue: "shipping-service.orders",
    routingKeys: ["order.confirmed"],
    handler: async (envelope) => {
      if (await isDuplicate(envelope.messageId)) {
        logger.debug({ messageId: envelope.messageId }, "duplicate — skipped");
        return;
      }
      if (envelope.type === "order.confirmed") await handler.onOrderConfirmed(envelope as never);
      await markProcessed(envelope.messageId, envelope.type);
    },
  });

  const app = buildServer(logger);
  await app.listen({ host: "0.0.0.0", port: config.port });
  logger.info({ port: config.port }, "shipping-service HTTP listening");

  const shutdown = async () => {
    await app.close();
    await bus.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "shipping-service failed to start");
  process.exit(1);
});
