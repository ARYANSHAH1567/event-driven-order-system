import { intEnv, optionalEnv } from "@ordersys/shared";

export const config = {
  serviceName: optionalEnv("SERVICE_NAME", "shipping-service"),
  port: intEnv("SHIPPING_PORT", 4004),
  rabbitUrl: optionalEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),
  /** How long after dispatch we simulate delivery. */
  deliverAfterMs: intEnv("DELIVER_AFTER_MS", 6000),
};
