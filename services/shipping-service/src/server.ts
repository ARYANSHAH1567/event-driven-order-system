import { type Logger, metricsContentType, metricsText } from "@ordersys/shared";
import Fastify from "fastify";
import { prisma } from "./db.js";

export function buildServer(logger: Logger) {
  const app = Fastify({ loggerInstance: logger });

  app.get("/healthz", async () => ({ status: "ok", service: "shipping-service" }));
  app.get("/metrics", async (_req, reply) => {
    reply.header("content-type", metricsContentType);
    return metricsText();
  });

  app.get("/api/shipments", async () => {
    const shipments = await prisma.shipment.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return { shipments };
  });

  return app;
}
