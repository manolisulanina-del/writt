// How coins are earned. Pure, so the rules can be unit-tested directly;
// lib/coins.ts applies them to the database.

import { createHash } from "node:crypto";

export const COINS = {
  book: 50,
  chapter: 10,
  /** A book (its published chapters together) or a chapter needs this many words to earn. */
  minWords: 300,
  booksPerDay: 3,
  chaptersPerDay: 10,
} as const;

/** Start of the current day in UTC: daily limits reset at midnight UTC. */
export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Identifies a piece of writing by its first 300 words, ignoring case,
 * punctuation and spacing. Posting the same text again (even after deleting
 * the original, or with a new title) gives the same fingerprint, so it can't
 * earn twice.
 */
export function writingFingerprint(text: string): string {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return createHash("sha256").update(words.slice(0, COINS.minWords).join(" ")).digest("hex");
}

export type EarnCheck = { words: number; earnedToday: number; alreadyEarned: boolean; duplicateText: boolean };

/** Whether a book earns its coins now. */
export function bookEarns(c: EarnCheck): boolean {
  return !c.alreadyEarned && !c.duplicateText && c.words >= COINS.minWords && c.earnedToday < COINS.booksPerDay;
}

/** Whether a new chapter of a public book earns its coins now. */
export function chapterEarns(c: EarnCheck): boolean {
  return !c.alreadyEarned && !c.duplicateText && c.words >= COINS.minWords && c.earnedToday < COINS.chaptersPerDay;
}

/** "You need 50 more coins." or null when the balance covers the price. */
export function shortfallMessage(balance: number, price: number): string | null {
  const missing = price - balance;
  return missing > 0 ? `You need ${missing} more coin${missing === 1 ? "" : "s"}.` : null;
}
