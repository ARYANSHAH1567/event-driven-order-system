import { type Logger, metricsContentType, metricsText } from "@ordersys/shared";
import Fastify from "fastify";
import { prisma } from "./db.js";

export function buildServer(logger: Logger) {
  const app = Fastify({ loggerInstance: logger });

  app.get("/healthz", async () => ({ status: "ok", service: "inventory-service" }));
  app.get("/metrics", async (_req, reply) => {
    reply.header("content-type", metricsContentType);
    return metricsText();
  });

  // Catalogue + live stock — used by the dashboard to build orders.
  app.get("/api/products", async () => {
    const products = await prisma.product.findMany({
      include: { inventory: true },
      orderBy: { name: "asc" },
    });
    return { products };
  });

  return app;
}
