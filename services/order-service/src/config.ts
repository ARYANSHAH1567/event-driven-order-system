import { optionalEnv } from "@ordersys/shared";

export const config = {
  serviceName: optionalEnv("SERVICE_NAME", "order-service"),
  port: Number.parseInt(optionalEnv("ORDER_PORT", "4001"), 10),
  rabbitUrl: optionalEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),

  // Peer services — used by the BFF endpoints (catalog proxy + health checks).
  services: {
    inventory: optionalEnv("INVENTORY_URL", "http://localhost:4002"),
    payment: optionalEnv("PAYMENT_URL", "http://localhost:4003"),
    shipping: optionalEnv("SHIPPING_URL", "http://localhost:4004"),
    notification: optionalEnv("NOTIFICATION_URL", "http://localhost:4005"),
  },

  // RabbitMQ management HTTP API — used to read queue depths & the DLQ.
  mgmt: {
    url: optionalEnv("RABBITMQ_MGMT_URL", "http://localhost:15672"),
    user: optionalEnv("RABBITMQ_MGMT_USER", "guest"),
    pass: optionalEnv("RABBITMQ_MGMT_PASS", "guest"),
  },
};
