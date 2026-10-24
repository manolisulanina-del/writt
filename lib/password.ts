import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashSecret(value: string): Promise<string> {
  return bcrypt.hash(value, ROUNDS);
}

export function verifySecret(value: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(value, hash);
}

/** Security answers are compared case- and whitespace-insensitively. */
export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}
