import { PrismaClient } from "./generated/prisma/index.js";

export const prisma = new PrismaClient();
export { ReservationStatus } from "./generated/prisma/index.js";
