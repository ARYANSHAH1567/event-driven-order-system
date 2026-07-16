import client from "prom-client";

/**
 * Per-process Prometheus registry. Each service imports these singletons; the
 * bus increments them automatically, and each service exposes `/metrics`.
 */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const eventsPublished = new client.Counter({
  name: "events_published_total",
  help: "Events published to the bus",
  labelNames: ["type", "producer"] as const,
  registers: [registry],
});

export const eventsConsumed = new client.Counter({
  name: "events_consumed_total",
  help: "Events consumed from the bus, by outcome",
  labelNames: ["type", "queue", "status"] as const, // status: success | retry | dlq
  registers: [registry],
});

export const processingDuration = new client.Histogram({
  name: "event_processing_duration_seconds",
  help: "Handler processing time per event",
  labelNames: ["type", "queue"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export function metricsText(): Promise<string> {
  return registry.metrics();
}

export const metricsContentType = registry.contentType;
