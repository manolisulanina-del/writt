import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Fixed-window rate limiter backed by MongoDB, so limits hold across
 * serverless instances. Small races can let a request or two through at the
 * edge of a window, which is acceptable for abuse prevention.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const existing = await prisma.rateLimit.findUnique({ where: { key } });

  if (!existing || existing.resetAt <= now) {
    const resetAt = new Date(now.getTime() + windowMs);
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, resetAt },
      update: { count: 1, resetAt },
    });
    // Occasionally clear out expired windows.
    if (Math.random() < 0.02) {
      await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
    }
    return { ok: true };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((existing.resetAt.getTime() - now.getTime()) / 1000),
    };
  }

  await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return { ok: true };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown"
  );
}

export function retryMessage(seconds: number): string {
  if (seconds < 60) return `Too many attempts. Try again in ${seconds} seconds.`;
  return `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minutes.`;
}
