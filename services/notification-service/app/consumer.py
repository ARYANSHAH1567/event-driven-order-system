import json
import logging

import aio_pika

from .config import settings
from .db import get_pool
from .metrics import notifications_sent

log = logging.getLogger("notification.consumer")

EXCHANGE = "orders.topic"
QUEUE = "notification-service.events"
ROUTING_KEYS = [
    "order.confirmed",
    "order.cancelled",
    "shipment.dispatched",
    "shipment.delivered",
]

# Which channel + human message each event maps to.
TEMPLATES = {
    "order.confirmed": ("email", "Your order is confirmed 🎉"),
    "order.cancelled": ("email", "Your order was cancelled — any charge has been refunded"),
    "shipment.dispatched": ("sms", "Your order has shipped"),
    "shipment.delivered": ("email", "Your order was delivered"),
}


async def _handle(message: aio_pika.abc.AbstractIncomingMessage) -> None:
    # ack on success; on exception the message is dropped (requeue=False).
    async with message.process(requeue=False):
        envelope = json.loads(message.body)
        message_id = envelope["messageId"]
        event_type = envelope["type"]
        data = envelope.get("data", {})
        order_id = data.get("orderId")

        channel, template = TEMPLATES.get(event_type, ("email", event_type))

        pool = get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Idempotency: record + notification insert commit together, so a
                # redelivered message can never send a duplicate notification.
                already = await conn.fetchval(
                    "SELECT 1 FROM processed_messages WHERE id = $1", message_id
                )
                if already:
                    log.debug("duplicate %s — skipped", message_id)
                    return
                await conn.execute(
                    "INSERT INTO notifications (order_id, channel, template) VALUES ($1, $2, $3)",
                    order_id,
                    channel,
                    template,
                )
                await conn.execute(
                    "INSERT INTO processed_messages (id, type) VALUES ($1, $2)",
                    message_id,
                    event_type,
                )
        notifications_sent.labels(event_type=event_type, channel=channel).inc()
        log.info("sent %s notification for order %s", event_type, order_id)


async def start_consumer() -> aio_pika.abc.AbstractRobustConnection:
    connection = await aio_pika.connect_robust(settings.rabbitmq_url)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=10)
    exchange = await channel.declare_exchange(
        EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )
    queue = await channel.declare_queue(QUEUE, durable=True)
    for key in ROUTING_KEYS:
        await queue.bind(exchange, routing_key=key)
    await queue.consume(_handle)
    log.info("subscribed to %s", ROUTING_KEYS)
    return connection
