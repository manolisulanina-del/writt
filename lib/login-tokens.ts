import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

// One-time links sent by email: family accounts signing in (they have no
// password) and password resets. Only a hash of each link is stored, and a
// link only works for the purpose it was sent for.

export type TokenPurpose = "FAMILY_LOGIN" | "PASSWORD_RESET";

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const validShape = (token: string) => /^[A-Za-z0-9_-]{20,64}$/.test(token);

export async function createLoginToken(userId: string, minutes = 30, purpose: TokenPurpose = "FAMILY_LOGIN"): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await prisma.loginToken.create({
    data: { userId, purpose, tokenHash: hash(token), expiresAt: new Date(Date.now() + minutes * 60_000), usedAt: null },
  });
  return token;
}

/** The user a link belongs to, if it's still usable, without using it up. */
export async function peekLoginToken(token: string, purpose: TokenPurpose): Promise<string | null> {
  if (!validShape(token)) return null;
  const row = await prisma.loginToken.findFirst({
    where: { tokenHash: hash(token), purpose, usedAt: null, expiresAt: { gt: new Date() } },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

/** Uses up a link and returns its user id, or null if it's unknown, used, expired or for something else. */
export async function consumeLoginToken(token: string, purpose: TokenPurpose = "FAMILY_LOGIN"): Promise<string | null> {
  if (!validShape(token)) return null;
  // Marking it used in the same update that checks it means two tabs can't both use it.
  const { count } = await prisma.loginToken.updateMany({
    where: { tokenHash: hash(token), purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (count === 0) return null;
  const row = await prisma.loginToken.findUnique({ where: { tokenHash: hash(token) }, select: { userId: true } });
  return row?.userId ?? null;
}

/** Makes every other unused link of this kind for the user stop working (e.g. after a reset). */
export async function revokeLoginTokens(userId: string, purpose: TokenPurpose) {
  await prisma.loginToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
}
