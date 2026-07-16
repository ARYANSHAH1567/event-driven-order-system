import { randomUUID } from "node:crypto";
import type { EventEnvelope, Logger, MessageBus } from "@ordersys/shared";
import { config } from "./config.js";
import { prisma } from "./db.js";

/**
 * Creates a shipment when an order is confirmed, emits `shipment.dispatched`,
 * then (after a delay, to mimic transit) emits `shipment.delivered`.
 */
export class ShippingHandler {
  constructor(
    private readonly bus: MessageBus,
    private readonly logger: Logger,
  ) {}

  async onOrderConfirmed(envelope: EventEnvelope<"order.confirmed">): Promise<void> {
    const { orderId } = envelope.data;
    const correlationId = envelope.correlationId;

    const trackingNumber = `TRK-${randomUUID().slice(0, 10).toUpperCase()}`;
    // Upsert keyed by orderId → re-processing the same confirmation is a no-op.
    const shipment = await prisma.shipment.upsert({
      where: { orderId },
      create: { orderId, trackingNumber, status: "DISPATCHED" },
      update: { status: "DISPATCHED" },
    });

    await this.bus.publish(
      "shipment.dispatched",
      { orderId, trackingNumber: shipment.trackingNumber },
      { correlationId, causationId: envelope.messageId },
    );
    this.logger.info({ orderId, trackingNumber: shipment.trackingNumber }, "shipment dispatched 📦");

    // Simulate transit → delivery. (In-memory timer is fine for the demo; a
    // production build would use a scheduled job / delayed message.)
    setTimeout(() => {
      void this.deliver(orderId, correlationId).catch((err) =>
        this.logger.error({ err, orderId }, "delivery simulation failed"),
      );
    }, config.deliverAfterMs);
  }

  private async deliver(orderId: string, correlationId: string): Promise<void> {
    await prisma.shipment.update({ where: { orderId }, data: { status: "DELIVERED" } });
    await this.bus.publish("shipment.delivered", { orderId }, { correlationId });
    this.logger.info({ orderId }, "shipment delivered ✅");
  }
}
