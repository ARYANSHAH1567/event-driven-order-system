import { intEnv, optionalEnv } from "@ordersys/shared";

export const config = {
  serviceName: optionalEnv("SERVICE_NAME", "inventory-service"),
  port: intEnv("INVENTORY_PORT", 4002),
  rabbitUrl: optionalEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),
};
