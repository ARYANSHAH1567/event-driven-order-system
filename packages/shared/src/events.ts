import { z } from "zod";

/**
 * The event catalog. Every message on the bus is an {@link EventEnvelope} whose
 * `type` is one of {@link EventType} and whose `data` conforms to the matching
 * schema below. This is the single source of truth for the contract between
 * services — producers and consumers both import from here.
 */

export const EVENT_TYPES = [
  "order.created",
  "inventory.reserved",
  "inventory.rejected",
  "payment.succeeded",
  "payment.failed",
  "order.confirmed",
  "order.cancelled",
  "shipment.dispatched",
  "shipment.delivered",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// ----- Shared value objects -----
export const OrderItemSchema = z.object({
  productId: z.string(),
  sku: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

// ----- Per-event payload schemas -----
export const EventDataSchemas = {
  "order.created": z.object({
    orderId: z.string(),
    customerId: z.string(),
    items: z.array(OrderItemSchema).min(1),
    totalAmount: z.number().nonnegative(),
    currency: z.string().default("USD"),
    // Failure-injection toggles — let the demo deterministically force a
    // rejected/failed leg to show the saga's compensating transactions live.
    simulate: z
      .object({
        outOfStock: z.boolean().optional(),
        paymentFailure: z.boolean().optional(),
      })
      .optional(),
  }),
  "inventory.reserved": z.object({
    orderId: z.string(),
    reservationId: z.string(),
  }),
  "inventory.rejected": z.object({
    orderId: z.string(),
    reason: z.string(),
  }),
  "payment.succeeded": z.object({
    orderId: z.string(),
    paymentId: z.string(),
    amount: z.number().nonnegative(),
  }),
  "payment.failed": z.object({
    orderId: z.string(),
    reason: z.string(),
  }),
  "order.confirmed": z.object({
    orderId: z.string(),
  }),
  "order.cancelled": z.object({
    orderId: z.string(),
    reason: z.string(),
  }),
  "shipment.dispatched": z.object({
    orderId: z.string(),
    trackingNumber: z.string(),
  }),
  "shipment.delivered": z.object({
    orderId: z.string(),
  }),
} satisfies Record<EventType, z.ZodTypeAny>;

export type EventDataMap = {
  [K in EventType]: z.infer<(typeof EventDataSchemas)[K]>;
};

/** Standard message envelope wrapping every event. */
export interface EventEnvelope<K extends EventType = EventType> {
  /** Unique per message — the key for idempotent consumers. */
  messageId: string;
  /** Ties every event of one order's journey together for tracing. */
  correlationId: string;
  /** The messageId that directly caused this event (causal chain). */
  causationId?: string;
  type: K;
  version: number;
  /** ISO-8601 */
  occurredAt: string;
  producer: string;
  data: EventDataMap[K];
}

export const EnvelopeSchema = z.object({
  messageId: z.string(),
  correlationId: z.string(),
  causationId: z.string().optional(),
  type: z.enum(EVENT_TYPES),
  version: z.number().int().positive(),
  occurredAt: z.string(),
  producer: z.string(),
  data: z.unknown(),
});

/**
 * Validate a decoded message into a fully-typed envelope. Throws (→ routed to
 * DLQ by the consumer) if the envelope shape or the payload is invalid.
 */
export function parseEnvelope(raw: unknown): EventEnvelope {
  const envelope = EnvelopeSchema.parse(raw);
  const dataSchema = EventDataSchemas[envelope.type];
  const data = dataSchema.parse(envelope.data);
  return { ...envelope, data } as EventEnvelope;
}
