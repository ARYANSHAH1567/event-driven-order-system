import type { EventEnvelope, Logger, MessageBus } from "@ordersys/shared";
import { prisma } from "./db.js";

/** Thrown to roll back a reservation transaction and emit `inventory.rejected`. */
class InsufficientStockError extends Error {}

export class InventoryHandler {
  constructor(
    private readonly bus: MessageBus,
    private readonly logger: Logger,
  ) {}

  /**
   * Reserve all items atomically. If any item is short (or the order requested a
   * simulated out-of-stock), the whole transaction rolls back and we emit
   * `inventory.rejected` instead of `inventory.reserved`.
   */
  async onOrderCreated(envelope: EventEnvelope<"order.created">): Promise<void> {
    const { orderId, items, simulate } = envelope.data;
    const meta = { correlationId: envelope.correlationId, causationId: envelope.messageId };

    try {
      if (simulate?.outOfStock) {
        throw new InsufficientStockError("simulated out-of-stock (demo toggle)");
      }

      await prisma.$transaction(async (tx) => {
        for (const item of items) {
          let inv = await tx.inventory.findUnique({ where: { productId: item.productId } });
          if (!inv) {
            await tx.product.upsert({
              where: { id: item.productId },
              create: { id: item.productId, sku: item.sku, name: item.sku, price: item.unitPrice },
              update: {},
            });
            inv = await tx.inventory.create({ data: { productId: item.productId, available: 100 } });
          }
          if (inv.available < item.quantity) {
            throw new InsufficientStockError(
              `insufficient stock for ${item.sku} (need ${item.quantity}, have ${inv.available})`,
            );
          }
          await tx.inventory.update({
            where: { productId: item.productId },
            data: { available: { decrement: item.quantity }, reserved: { increment: item.quantity } },
          });
          await tx.reservation.create({
            data: { orderId, productId: item.productId, quantity: item.quantity, status: "HELD" },
          });
        }
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        await this.bus.publish("inventory.rejected", { orderId, reason: err.message }, meta);
        this.logger.warn({ orderId, reason: err.message }, "inventory rejected");
        return;
      }
      throw err; // genuine failure → let the bus retry / dead-letter it
    }

    await this.bus.publish("inventory.reserved", { orderId, reservationId: orderId }, meta);
    this.logger.info({ orderId, items: items.length }, "inventory reserved");
  }

  /**
   * Compensating transaction: release any stock still held for a cancelled order.
   * Idempotent — only HELD reservations are released, so redelivery is a no-op.
   */
  async onOrderCancelled(envelope: EventEnvelope<"order.cancelled">): Promise<void> {
    const { orderId } = envelope.data;
    const released = await prisma.$transaction(async (tx) => {
      const held = await tx.reservation.findMany({ where: { orderId, status: "HELD" } });
      for (const r of held) {
        await tx.inventory.update({
          where: { productId: r.productId },
          data: { available: { increment: r.quantity }, reserved: { decrement: r.quantity } },
        });
        await tx.reservation.update({ where: { id: r.id }, data: { status: "RELEASED" } });
      }
      return held.length;
    });
    if (released > 0) this.logger.info({ orderId, released }, "inventory released (compensation)");
  }
}
