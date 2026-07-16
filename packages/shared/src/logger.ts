import pino, { type Logger } from "pino";
import { optionalEnv } from "./env.js";

/**
 * Structured JSON logger. In development we pretty-print; in production we emit
 * raw JSON lines (ready for log aggregation). Every service binds its name so
 * logs are attributable, and correlation IDs are added per-message downstream.
 */
export function createLogger(service: string): Logger {
  const level = optionalEnv("LOG_LEVEL", "info");
  const isDev = optionalEnv("NODE_ENV", "development") !== "production";

  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(isDev
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
          },
        }
      : {}),
  });
}

export type { Logger };
