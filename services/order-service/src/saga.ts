import type { EventEnvelope, Logger } from "@ordersys/shared";
import { OrderStatus, prisma } from "./db.js";
import { enqueueOutbox } from "./outbox.js";

/**
 * The order saga coordinator.
 *
 * Success path: confirm once BOTH the inventory and payment legs succeed.
 * Failure path: if either leg is rejected/fails, cancel and emit
 * `order.cancelled` — the trigger the other services consume to run their
 * compensating transactions (release stock / refund payment).
 *
 * Every state change and its resulting event are written in one transaction via
 * the outbox, so the emitted event can never diverge from the committed state.
 */
export class OrderSaga {
  constructor(private readonly logger: Logger) {}

  private async recordEvent(envelope: EventEnvelope): Promise<void> {
    const orderId = (envelope.data as { orderId: string }).orderId;
    await prisma.orderEvent.create({
      data: {
        orderId,
        type: envelope.type,
        producer: envelope.producer,
        payload: envelope.data as object,
      },
    });
  }

  // ---- Success legs ----
  async onInventoryReserved(envelope: EventEnvelope<"inventory.reserved">): Promise<void> {
    await this.recordEvent(envelope);
    await prisma.order.update({
      where: { id: envelope.data.orderId },
      data: { inventoryReserved: true },
    });
    await this.maybeConfirm(envelope.data.orderId, envelope.correlationId, envelope.messageId);
  }

  async onPaymentSucceeded(envelope: EventEnvelope<"payment.succeeded">): Promise<void> {
    await this.recordEvent(envelope);
    await prisma.order.update({
      where: { id: envelope.data.orderId },
      data: { paymentSucceeded: true },
    });
    await this.maybeConfirm(envelope.data.orderId, envelope.correlationId, envelope.messageId);
  }

  // ---- Failure legs → cancel + compensate ----
  async onInventoryRejected(envelope: EventEnvelope<"inventory.rejected">): Promise<void> {
    await this.recordEvent(envelope);
    await this.cancelOrder(
      envelope.data.orderId,
      `inventory rejected: ${envelope.data.reason}`,
      envelope.correlationId,
      envelope.messageId,
    );
  }

  async onPaymentFailed(envelope: EventEnvelope<"payment.failed">): Promise<void> {
    await this.recordEvent(envelope);
    await this.cancelOrder(
      envelope.data.orderId,
      `payment failed: ${envelope.data.reason}`,
      envelope.correlationId,
      envelope.messageId,
    );
  }

  // ---- Downstream lifecycle ----
  async onShipmentDispatched(envelope: EventEnvelope<"shipment.dispatched">): Promise<void> {
    await this.recordEvent(envelope);
    await prisma.order.updateMany({
      where: { id: envelope.data.orderId, status: OrderStatus.CONFIRMED },
      data: { status: OrderStatus.SHIPPED },
    });
  }

  async onShipmentDelivered(envelope: EventEnvelope<"shipment.delivered">): Promise<void> {
    await this.recordEvent(envelope);
    await prisma.order.updateMany({
      where: { id: envelope.data.orderId, status: OrderStatus.SHIPPED },
      data: { status: OrderStatus.DELIVERED },
    });
  }

  private async maybeConfirm(
    orderId: string,
    correlationId: string,
    causationId: string,
  ): Promise<void> {
    const confirmed = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.status !== OrderStatus.PENDING) return false;
      if (!order.inventoryReserved || !order.paymentSucceeded) return false;

      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CONFIRMED } });
      await tx.orderEvent.create({
        data: { orderId, type: "order.confirmed", producer: "order-service", payload: { orderId } },
      });
      await enqueueOutbox(tx, {
        aggregateId: orderId,
        type: "order.confirmed",
        data: { orderId },
        correlationId,
        causationId,
      });
      return true;
    });
    if (confirmed) this.logger.info({ orderId }, "order confirmed ✅");
  }

  private async cancelOrder(
    orderId: string,
    reason: string,
    correlationId: string,
    causationId: string,
  ): Promise<void> {
    const cancelled = await prisma.$transaction(async (tx) => {
      const res = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.CANCELLED, cancellationReason: reason },
      });
      if (res.count === 0) return false; // already resolved — nothing to compensate

      await tx.orderEvent.create({
        data: {
          orderId,
          type: "order.cancelled",
          producer: "order-service",
          payload: { orderId, reason },
        },
      });
      await enqueueOutbox(tx, {
        aggregateId: orderId,
        type: "order.cancelled",
        data: { orderId, reason },
        correlationId,
        causationId,
      });
      return true;
    });
    if (cancelled) this.logger.warn({ orderId, reason }, "order cancelled — compensating ↩️");
  }
}
