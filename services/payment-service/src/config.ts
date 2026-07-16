import { intEnv, optionalEnv } from "@ordersys/shared";

export const config = {
  serviceName: optionalEnv("SERVICE_NAME", "payment-service"),
  port: intEnv("PAYMENT_PORT", 4003),
  rabbitUrl: optionalEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),
};
