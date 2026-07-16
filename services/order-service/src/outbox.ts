import type { EventDataMap, EventType, Logger, MessageBus } from "@ordersys/shared";
import { prisma } from "./db.js";
import type { Prisma } from "./generated/prisma/index.js";

/**
 * Append an event to the outbox inside an existing transaction. Because the row
 * is written in the same transaction as the state change, either both commit or
 * neither does — the event can never be "lost" after a committed state change.
 */
export async function enqueueOutbox<K extends EventType>(
  tx: Prisma.TransactionClient,
  params: {
    aggregateId: string;
    type: K;
    data: EventDataMap[K];
    correlationId: string;
    causationId?: string;
  },
): Promise<void> {
  await tx.outbox.create({
    data: {
      aggregateId: params.aggregateId,
      type: params.type,
      payload: params.data as object,
      correlationId: params.correlationId,
      causationId: params.causationId ?? null,
    },
  });
}

/**
 * Polls the outbox and publishes unsent events to RabbitMQ, using the outbox row
 * id as the message id so a crash between publish and mark-published results in
 * a harmless duplicate (deduped by the idempotent consumers) rather than a loss.
 */
export class OutboxRelay {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly bus: MessageBus,
    private readonly logger: Logger,
  ) {}

  start(intervalMs = 500): void {
    this.timer = setInterval(() => {
      void this.flush().catch((err) => this.logger.error({ err }, "outbox flush failed"));
    }, intervalMs);
    this.logger.info({ intervalMs }, "outbox relay started");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async flush(): Promise<void> {
    if (this.running) return; // avoid overlapping ticks
    this.running = true;
    try {
      const rows = await prisma.outbox.findMany({
        where: { published: false },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      for (const row of rows) {
        await this.bus.publish(row.type as EventType, row.payload as never, {
          correlationId: row.correlationId,
          causationId: row.causationId ?? undefined,
          messageId: row.id,
        });
        await prisma.outbox.update({ where: { id: row.id }, data: { published: true } });
      }
      if (rows.length) this.logger.debug({ count: rows.length }, "outbox flushed");
    } finally {
      this.running = false;
    }
  }
}
