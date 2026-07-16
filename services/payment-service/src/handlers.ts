import { randomUUID } from "node:crypto";
import type { EventEnvelope, Logger, MessageBus } from "@ordersys/shared";
import { prisma } from "./db.js";

/**
 * Charges payment in response to `order.created` (provider mocked). Emits
 * `payment.succeeded`, or `payment.failed` when the order requests a simulated
 * failure. Refunds on `order.cancelled` as its compensating transaction.
 */
export class PaymentHandler {
  constructor(
    private readonly bus: MessageBus,
    private readonly logger: Logger,
  ) {}

  async onOrderCreated(envelope: EventEnvelope<"order.created">): Promise<void> {
    const { orderId, totalAmount, simulate } = envelope.data;
    const meta = { correlationId: envelope.correlationId, causationId: envelope.messageId };

    const payment = await prisma.payment.create({
      data: { orderId, amount: totalAmount, status: "PENDING" },
    });

    await new Promise((r) => setTimeout(r, 150)); // simulate provider latency

    if (simulate?.paymentFailure) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", failureCode: "card_declined" },
      });
      await this.bus.publish(
        "payment.failed",
        { orderId, reason: "card declined (demo toggle)" },
        meta,
      );
      this.logger.warn({ orderId, paymentId: payment.id }, "payment failed");
      return;
    }

    const providerRef = `ch_${randomUUID().slice(0, 12)}`;
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCEEDED", providerRef },
    });
    await this.bus.publish(
      "payment.succeeded",
      { orderId, paymentId: payment.id, amount: totalAmount },
      meta,
    );
    this.logger.info({ orderId, paymentId: payment.id, amount: totalAmount }, "payment succeeded");
  }

  /**
   * Compensating transaction: refund a successful charge for a cancelled order.
   * Idempotent — only a SUCCEEDED payment transitions to REFUNDED.
   */
  async onOrderCancelled(envelope: EventEnvelope<"order.cancelled">): Promise<void> {
    const { orderId } = envelope.data;
    const result = await prisma.payment.updateMany({
      where: { orderId, status: "SUCCEEDED" },
      data: { status: "REFUNDED" },
    });
    if (result.count > 0) this.logger.info({ orderId }, "payment refunded (compensation)");
  }
}
