import { MessageBus, createLogger } from "@ordersys/shared";
import { config } from "./config.js";
import { isDuplicate, markProcessed } from "./idempotency.js";
import { OutboxRelay } from "./outbox.js";
import { OrderSaga } from "./saga.js";
import { buildServer } from "./server.js";

const logger = createLogger(config.serviceName);

async function main() {
  const bus = new MessageBus({ url: config.rabbitUrl, producer: "order-service", logger });
  await bus.connect();

  const relay = new OutboxRelay(bus, logger);
  relay.start();

  const saga = new OrderSaga(logger);

  const dispatch = async (envelope: Parameters<Parameters<typeof bus.subscribe>[0]["handler"]>[0]) => {
    switch (envelope.type) {
      case "inventory.reserved":
        return saga.onInventoryReserved(envelope as never);
      case "inventory.rejected":
        return saga.onInventoryRejected(envelope as never);
      case "payment.succeeded":
        return saga.onPaymentSucceeded(envelope as never);
      case "payment.failed":
        return saga.onPaymentFailed(envelope as never);
      case "shipment.dispatched":
        return saga.onShipmentDispatched(envelope as never);
      case "shipment.delivered":
        return saga.onShipmentDelivered(envelope as never);
    }
  };

  await bus.subscribe({
    queue: "order-service.saga",
    routingKeys: [
      "inventory.reserved",
      "inventory.rejected",
      "payment.succeeded",
      "payment.failed",
      "shipment.dispatched",
      "shipment.delivered",
    ],
    handler: async (envelope) => {
      if (await isDuplicate(envelope.messageId)) {
        logger.debug({ messageId: envelope.messageId }, "duplicate — skipped");
        return;
      }
      await dispatch(envelope);
      await markProcessed(envelope.messageId, envelope.type);
    },
  });

  const app = buildServer(bus, logger);
  await app.listen({ host: "0.0.0.0", port: config.port });
  logger.info({ port: config.port }, "order-service HTTP listening");

  const shutdown = async () => {
    logger.info("shutting down…");
    relay.stop();
    await app.close();
    await bus.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "order-service failed to start");
  process.exit(1);
});
