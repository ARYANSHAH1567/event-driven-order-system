import type { Logger } from "@ordersys/shared";
import { prisma } from "./db.js";

/** Demo catalogue. `kettle` is intentionally low-stock for the Phase 2 rejection demo. */
const SEED = [
  { id: "prod-espresso", sku: "ESP-01", name: "Espresso Beans 1kg", price: 24.0, stock: 50 },
  { id: "prod-mug", sku: "MUG-01", name: "Ceramic Mug", price: 14.0, stock: 200 },
  { id: "prod-grinder", sku: "GRD-01", name: "Hand Grinder", price: 45.0, stock: 30 },
  { id: "prod-filter", sku: "FLT-01", name: "Paper Filters (100)", price: 8.0, stock: 500 },
  { id: "prod-kettle", sku: "KTL-01", name: "Gooseneck Kettle", price: 60.0, stock: 5 },
];

/** Idempotent — safe to run on every boot. */
export async function seedProducts(logger: Logger): Promise<void> {
  for (const p of SEED) {
    await prisma.product.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        inventory: { create: { available: p.stock } },
      },
      update: { name: p.name, price: p.price },
    });
  }
  logger.info({ products: SEED.length }, "catalogue seeded");
}
