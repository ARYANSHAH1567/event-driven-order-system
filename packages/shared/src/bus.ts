import { randomUUID } from "node:crypto";
import amqp from "amqplib";
import type { Logger } from "pino";
import {
  type EventDataMap,
  type EventEnvelope,
  type EventType,
  parseEnvelope,
} from "./events.js";
import { eventsConsumed, eventsPublished, processingDuration } from "./metrics.js";

// Derive amqplib's types from the library itself so we don't depend on a
// specific @types shape (the connect return type changed across versions).
type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;
type AmqpChannel = Awaited<ReturnType<AmqpConnection["createChannel"]>>;

export const EXCHANGE = "orders.topic";

export interface PublishOptions {
  correlationId?: string;
  causationId?: string;
  /** Override the generated messageId — used by the outbox relay so a
   *  re-published message keeps a stable id and downstream dedup still works. */
  messageId?: string;
}

export interface Handler<K extends EventType = EventType> {
  (envelope: EventEnvelope<K>): Promise<void>;
}

export interface SubscribeOptions {
  /** Durable queue name — one per (service, purpose). */
  queue: string;
  /** Routing keys (event types) this queue binds to. */
  routingKeys: EventType[];
  /** Max unacknowledged messages in flight. */
  prefetch?: number;
  /** Delivery attempts before a message is dead-lettered. */
  maxRetries?: number;
  handler: Handler;
}

/**
 * Thin, opinionated wrapper over amqplib built around a single durable topic
 * exchange.
 *
 * Reliability model (Phase 3):
 *  - Publishing always emits a well-formed, persistent {@link EventEnvelope}.
 *  - Each subscription gets a companion `<queue>.retry` and `<queue>.dlq`.
 *  - A failing handler is retried with exponential backoff + jitter (via a
 *    per-message-TTL retry queue that dead-letters back to the main queue).
 *  - After `maxRetries`, the message is parked on the DLQ for inspection/replay
 *    instead of being silently dropped.
 */
export class MessageBus {
  private connection?: AmqpConnection;
  private channel?: AmqpChannel;

  constructor(
    private readonly opts: { url: string; producer: string; logger: Logger },
  ) {}

  async connect(retries = 10, delayMs = 2000): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.connection = await amqp.connect(this.opts.url);
        this.channel = await this.connection.createChannel();
        await this.channel.assertExchange(EXCHANGE, "topic", { durable: true });
        this.opts.logger.info({ exchange: EXCHANGE }, "connected to RabbitMQ");
        this.connection.on("error", (err) =>
          this.opts.logger.error({ err }, "RabbitMQ connection error"),
        );
        return;
      } catch (err) {
        this.opts.logger.warn({ attempt, retries }, "RabbitMQ not ready, retrying…");
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  private requireChannel(): AmqpChannel {
    if (!this.channel) throw new Error("MessageBus not connected — call connect() first");
    return this.channel;
  }

  /** Publish a typed event. Returns the messageId used. */
  async publish<K extends EventType>(
    type: K,
    data: EventDataMap[K],
    options: PublishOptions = {},
  ): Promise<string> {
    const channel = this.requireChannel();
    const messageId = options.messageId ?? randomUUID();
    const envelope: EventEnvelope<K> = {
      messageId,
      correlationId: options.correlationId ?? randomUUID(),
      causationId: options.causationId,
      type,
      version: 1,
      occurredAt: new Date().toISOString(),
      producer: this.opts.producer,
      data,
    };

    channel.publish(EXCHANGE, type, Buffer.from(JSON.stringify(envelope)), {
      persistent: true,
      messageId,
      correlationId: envelope.correlationId,
      contentType: "application/json",
      type,
    });
    eventsPublished.inc({ type, producer: this.opts.producer });
    this.opts.logger.debug({ type, messageId, correlationId: envelope.correlationId }, "published");
    return messageId;
  }

  async subscribe(options: SubscribeOptions): Promise<void> {
    const channel = this.requireChannel();
    const { queue, routingKeys, handler, prefetch = 10, maxRetries = 5 } = options;
    const retryQueue = `${queue}.retry`;
    const dlq = `${queue}.dlq`;

    await channel.assertQueue(queue, { durable: true });
    await channel.assertQueue(dlq, { durable: true });
    // Messages parked here expire after their per-message TTL and are then
    // dead-lettered (via the default exchange) straight back to the main queue.
    await channel.assertQueue(retryQueue, {
      durable: true,
      arguments: { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": queue },
    });
    for (const key of routingKeys) await channel.bindQueue(queue, EXCHANGE, key);
    await channel.prefetch(prefetch);

    await channel.consume(queue, async (msg) => {
      if (!msg) return;
      const log = this.opts.logger.child({ queue });

      let envelope: EventEnvelope;
      try {
        envelope = parseEnvelope(JSON.parse(msg.content.toString()));
      } catch (err) {
        // Poison message (bad JSON / schema) — no point retrying, park it now.
        log.error({ err }, "unprocessable message → DLQ");
        channel.sendToQueue(dlq, msg.content, {
          persistent: true,
          headers: { ...msg.properties.headers, "x-error": "unprocessable", "x-original-queue": queue },
        });
        channel.ack(msg);
        return;
      }

      const mlog = log.child({
        type: envelope.type,
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
      });

      const endTimer = processingDuration.startTimer({ type: envelope.type, queue });
      try {
        await handler(envelope);
        endTimer();
        eventsConsumed.inc({ type: envelope.type, queue, status: "success" });
        channel.ack(msg);
      } catch (err) {
        endTimer();
        const attempts = Number(msg.properties.headers?.["x-attempts"] ?? 0) + 1;
        const headers = { ...msg.properties.headers, "x-attempts": attempts };
        const forward = {
          persistent: true,
          messageId: msg.properties.messageId,
          correlationId: msg.properties.correlationId,
          type: msg.properties.type,
        } as const;

        if (attempts <= maxRetries) {
          const delay = backoff(attempts);
          mlog.warn({ attempts, delay, err: (err as Error).message }, "handler failed → retry");
          channel.sendToQueue(retryQueue, msg.content, {
            ...forward,
            expiration: String(delay),
            headers,
          });
          eventsConsumed.inc({ type: envelope.type, queue, status: "retry" });
        } else {
          mlog.error({ attempts, err: (err as Error).message }, "retries exhausted → DLQ");
          channel.sendToQueue(dlq, msg.content, {
            ...forward,
            headers: { ...headers, "x-error": (err as Error).message, "x-original-queue": queue },
          });
          eventsConsumed.inc({ type: envelope.type, queue, status: "dlq" });
        }
        channel.ack(msg);
      }
    });

    this.opts.logger.info({ queue, routingKeys, maxRetries }, "subscribed");
  }

  /**
   * Re-publish dead-lettered messages back onto the exchange (ops "replay").
   * Returns how many were replayed.
   */
  async replayDeadLettered(queue: string, limit = 50): Promise<number> {
    const channel = this.requireChannel();
    const dlq = `${queue}.dlq`;
    let count = 0;
    for (let i = 0; i < limit; i++) {
      const msg = await channel.get(dlq, { noAck: false });
      if (!msg) break;
      const type = (msg.properties.type as string) ?? JSON.parse(msg.content.toString()).type;
      channel.publish(EXCHANGE, type, msg.content, {
        persistent: true,
        messageId: msg.properties.messageId,
        correlationId: msg.properties.correlationId,
        type,
      });
      channel.ack(msg);
      count++;
    }
    if (count > 0) this.opts.logger.info({ queue, count }, "replayed dead-lettered messages");
    return count;
  }

  async close(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}

/** Exponential backoff with jitter, capped at 30s. */
function backoff(attempt: number): number {
  const base = 1000;
  const cap = 30_000;
  const exp = Math.min(cap, base * 2 ** (attempt - 1));
  return exp + Math.floor(Math.random() * 250);
}
