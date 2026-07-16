import { PrismaClient } from "./generated/prisma/index.js";

export const prisma = new PrismaClient();
export { PaymentStatus } from "./generated/prisma/index.js";
