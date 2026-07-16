import { prisma } from "./db.js";

export async function isDuplicate(messageId: string): Promise<boolean> {
  return (await prisma.processedMessage.findUnique({ where: { id: messageId } })) !== null;
}

export async function markProcessed(messageId: string, type: string): Promise<void> {
  await prisma.processedMessage.create({ data: { id: messageId, type } }).catch(() => undefined);
}
