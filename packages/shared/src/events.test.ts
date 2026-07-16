import { describe, expect, it } from "vitest";
import { EVENT_TYPES, type EventDataMap, EventDataSchemas, parseEnvelope } from "./events.js";

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    messageId: "m1",
    correlationId: "c1",
    type: "order.created",
    version: 1,
    occurredAt: new Date().toISOString(),
    producer: "test",
    data: {
      orderId: "o1",
      customerId: "cust",
      items: [{ productId: "p", sku: "S", quantity: 1, unitPrice: 5 }],
      totalAmount: 5,
      currency: "USD",
    },
    ...overrides,
  };
}

describe("event catalog", () => {
  it("has a schema for every declared event type", () => {
    for (const type of EVENT_TYPES) {
      expect(EventDataSchemas[type]).toBeDefined();
    }
  });

  it("parses a valid order.created envelope into a typed value", () => {
    const parsed = parseEnvelope(envelope());
    expect(parsed.type).toBe("order.created");
    const data = parsed.data as EventDataMap["order.created"];
    expect(data.items).toHaveLength(1);
    expect(data.totalAmount).toBe(5);
  });

  it("rejects an unknown event type", () => {
    expect(() => parseEnvelope(envelope({ type: "order.exploded" }))).toThrow();
  });

  it("rejects a payload that violates its schema", () => {
    // order.created requires at least one item
    expect(() => parseEnvelope(envelope({ data: { orderId: "o1", customerId: "c", items: [], totalAmount: 0 } }))).toThrow();
  });

  it("carries optional failure-injection flags through", () => {
    const parsed = parseEnvelope(
      envelope({ data: { ...envelope().data, simulate: { paymentFailure: true } } }),
    );
    const data = parsed.data as EventDataMap["order.created"];
    expect(data.simulate?.paymentFailure).toBe(true);
  });
});
