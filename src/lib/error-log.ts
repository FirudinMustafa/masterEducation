import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ErrorSource = "server" | "client" | "api";

export interface ErrorLogInput {
  source: ErrorSource;
  message: string;
  stack?: string | null;
  url?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Fire-and-forget error logger. We never want logging failure to cascade
 * into a second error — warn to console and swallow.
 */
export function logError(input: ErrorLogInput): void {
  prisma.errorLog
    .create({
      data: {
        source: input.source,
        message: input.message.slice(0, 4000),
        stack: input.stack?.slice(0, 8000) ?? null,
        url: input.url?.slice(0, 1000) ?? null,
        userId: input.userId ?? null,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
        metadata: input.metadata,
      },
    })
    .catch((err) => {
      console.error("[error-log] write failed", err);
    });
}
