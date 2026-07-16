import { type Logger, metricsContentType, metricsText } from "@ordersys/shared";
import Fastify from "fastify";
import { prisma } from "./db.js";

export function buildServer(logger: Logger) {
  const app = Fastify({ loggerInstance: logger });

  app.get("/healthz", async () => ({ status: "ok", service: "payment-service" }));
  app.get("/metrics", async (_req, reply) => {
    reply.header("content-type", metricsContentType);
    return metricsText();
  });

  app.get("/api/payments", async () => {
    const payments = await prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return { payments };
  });

  return app;
}
