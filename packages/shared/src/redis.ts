import { Redis } from "ioredis";
import { optionalEnv } from "./env.js";

/** Create a Redis client. Used for idempotency keys and caching (Phase 3+). */
export function createRedis(url = optionalEnv("REDIS_URL", "redis://localhost:6379")): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
}

export type { Redis };
