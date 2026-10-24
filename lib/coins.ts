import "server-only";
import type { CoinReason, Prisma } from "@prisma/client";
import { prisma, isUniqueViolation } from "@/lib/db";
import { COINS, bookEarns, chapterEarns, startOfUtcDay, writingFingerprint } from "@/lib/coin-rules";
import { notify } from "@/lib/notifications";
import { docText, type RichDoc } from "@/lib/rich-text";

// Every coin change goes through changeCoins(), inside a database transaction,
// so User.coins always equals the sum of the user's CoinTransaction rows and
// can never go below 0. Nothing here can be reached from the browser except
// through server actions that check the rules first.

type Tx = Prisma.TransactionClient;

/** MongoDB refused a transaction because another one changed the same documents at the same moment. */
function isWriteConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2034";
}

/**
 * Runs a coin transaction, retrying a few times if another one (say, a second
 * purchase in another tab) touched the same balance at the same moment. Each
 * attempt re-checks everything, so a retry can never overspend.
 */
export async function coinTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn);
    } catch (error) {
      if (!isWriteConflict(error) || attempt >= 4) throw error;
      await new Promise((r) => setTimeout(r, 40 * attempt + Math.random() * 60));
    }
  }
}

export class NotEnoughCoins extends Error {
  constructor(public missing: number) {
    super(`Not enough coins (${missing} short)`);
  }
}

type Meta = { fanficId?: string | null; chapterId?: string | null; theme?: string | null; note?: string | null };

/** Adds coins (positive amount) or takes them (negative). Throws NotEnoughCoins instead of going below 0. */
export async function changeCoins(tx: Tx, userId: string, amount: number, reason: CoinReason, meta: Meta = {}) {
  if (!Number.isInteger(amount) || amount === 0) return;
  if (amount < 0) {
    // The balance check and the change are one atomic update.
    const { count } = await tx.user.updateMany({ where: { id: userId, coins: { gte: -amount } }, data: { coins: { increment: amount } } });
    if (count === 0) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { coins: true } });
      throw new NotEnoughCoins(-amount - (user?.coins ?? 0));
    }
  } else {
    await tx.user.update({ where: { id: userId }, data: { coins: { increment: amount } } });
  }
  await tx.coinTransaction.create({
    data: {
      userId,
      amount,
      reason,
      fanficId: meta.fanficId ?? null,
      chapterId: meta.chapterId ?? null,
      theme: meta.theme ?? null,
      note: meta.note ?? null,
    },
  });
}

/** Records the earning and pays it, once: a second attempt for the same book, chapter or text earns nothing. */
async function earnOnce(userId: string, kind: "BOOK" | "CHAPTER", objectKey: string, fingerprint: string, amount: number, reason: CoinReason, meta: Meta) {
  try {
    await coinTransaction(async (tx) => {
      await tx.coinEarning.create({ data: { userId, kind, objectKey, fingerprint } });
      await changeCoins(tx, userId, amount, reason, meta);
    });
    return amount;
  } catch (error) {
    if (isUniqueViolation(error)) return 0;
    throw error;
  }
}

async function chapterText(chapterIds: string[]): Promise<string> {
  const pages = await prisma.page.findMany({
    where: { chapterId: { in: chapterIds } },
    select: { chapterId: true, order: true, content: true },
  });
  return chapterIds
    .flatMap((id) => pages.filter((p) => p.chapterId === id).sort((a, b) => a.order - b.order))
    .map((p) => docText(p.content as unknown as RichDoc))
    .join(" ");
}

const earnedToday = (userId: string, reason: CoinReason) =>
  prisma.coinTransaction.count({ where: { userId, reason, createdAt: { gte: startOfUtcDay() } } });

/**
 * Pays coins a public book has earned and not yet received:
 * - 50 for the book, once, when its published chapters reach 300 words;
 * - 10 for each chapter of 300+ words added after the book was first published.
 * Daily limits (3 books, 10 chapters) apply; something over the limit can
 * still earn on a later day. Returns the coins paid now.
 */
export async function awardCoinsForBook(fanficId: string): Promise<number> {
  const book = await prisma.fanfic.findUnique({
    where: { id: fanficId },
    select: {
      id: true,
      title: true,
      authorId: true,
      visibility: true,
      removed: true,
      coinsCheckedAt: true,
      author: { select: { kind: true } },
      chapters: { orderBy: { order: "asc" }, select: { id: true, publishAt: true, wordCount: true, coinsChecked: true } },
    },
  });
  if (!book || book.visibility !== "PUBLIC" || book.removed || book.author.kind === "FAMILY") return 0;

  const now = Date.now();
  const visible = book.chapters.filter((c) => !c.publishAt || c.publishAt.getTime() <= now);
  const userId = book.authorId;
  let earned = 0;

  // The chapters a book has when it's first published are part of the book.
  const firstCheck = !book.coinsCheckedAt;
  if (firstCheck) {
    await prisma.$transaction([
      prisma.fanfic.update({ where: { id: book.id }, data: { coinsCheckedAt: new Date() } }),
      prisma.chapter.updateMany({ where: { id: { in: visible.map((c) => c.id) } }, data: { coinsChecked: true } }),
    ]);
  }

  const bookKey = `BOOK:${book.id}`;
  if (!(await prisma.coinEarning.findUnique({ where: { objectKey: bookKey }, select: { id: true } }))) {
    const words = visible.reduce((n, c) => n + c.wordCount, 0);
    if (words >= COINS.minWords) {
      const fingerprint = writingFingerprint(await chapterText(visible.map((c) => c.id)));
      const duplicate = await prisma.coinEarning.findUnique({ where: { userId_kind_fingerprint: { userId, kind: "BOOK", fingerprint } }, select: { id: true } });
      if (bookEarns({ words, earnedToday: await earnedToday(userId, "BOOK_PUBLISHED"), alreadyEarned: false, duplicateText: Boolean(duplicate) })) {
        earned += await earnOnce(userId, "BOOK", bookKey, fingerprint, COINS.book, "BOOK_PUBLISHED", { fanficId: book.id, note: book.title });
      }
    }
  }

  if (!firstCheck) {
    for (const chapter of visible.filter((c) => !c.coinsChecked && c.wordCount >= COINS.minWords)) {
      const fingerprint = writingFingerprint(await chapterText([chapter.id]));
      const duplicate = await prisma.coinEarning.findUnique({ where: { userId_kind_fingerprint: { userId, kind: "CHAPTER", fingerprint } }, select: { id: true } });
      const today = await earnedToday(userId, "CHAPTER_PUBLISHED");
      if (duplicate) {
        // The same text already earned once; it never will again.
        await prisma.chapter.update({ where: { id: chapter.id }, data: { coinsChecked: true } });
        continue;
      }
      if (!chapterEarns({ words: chapter.wordCount, earnedToday: today, alreadyEarned: false, duplicateText: false })) continue;
      const paid = await earnOnce(userId, "CHAPTER", `CHAPTER:${chapter.id}`, fingerprint, COINS.chapter, "CHAPTER_PUBLISHED", {
        fanficId: book.id,
        chapterId: chapter.id,
        note: book.title,
      });
      earned += paid;
      await prisma.chapter.update({ where: { id: chapter.id }, data: { coinsChecked: true } });
    }
  }

  if (earned > 0) {
    await notify(userId, {
      kind: "COINS",
      title: `+${earned} coins`,
      body: `You earned ${earned} coins for publishing “${book.title}”. Spend them on homepage themes in the shop.`,
      link: "/shop",
    });
  }
  return earned;
}

/** Coins a book has earned and its author still holds (earnings, minus take-backs, plus give-backs). */
async function heldForBook(fanficId: string) {
  const rows = await prisma.coinTransaction.findMany({
    where: { fanficId, reason: { in: ["BOOK_PUBLISHED", "CHAPTER_PUBLISHED", "BOOK_REMOVED", "BOOK_RESTORED"] } },
    select: { userId: true, amount: true, reason: true },
  });
  const held = rows.reduce((n, r) => n + r.amount, 0);
  const taken = rows.filter((r) => r.reason === "BOOK_REMOVED").reduce((n, r) => n - r.amount, 0);
  const given = rows.filter((r) => r.reason === "BOOK_RESTORED").reduce((n, r) => n + r.amount, 0);
  return { userId: rows[0]?.userId ?? null, held, outstanding: taken - given };
}

/** When a book is removed (by reports or the admin): takes back what it earned, never below 0. Returns coins taken. */
export async function takeBackBookCoins(fanficId: string): Promise<number> {
  const { userId, held } = await heldForBook(fanficId);
  if (!userId || held <= 0) return 0;
  return coinTransaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { coins: true } });
    const take = Math.min(held, user?.coins ?? 0);
    if (take > 0) await changeCoins(tx, userId, -take, "BOOK_REMOVED", { fanficId, note: "Book removed" });
    return take;
  });
}

/** When a removed book is restored (appeal approved, or /restore): gives back what was taken. Returns coins given. */
export async function giveBackBookCoins(fanficId: string): Promise<number> {
  const { userId, outstanding } = await heldForBook(fanficId);
  if (!userId || outstanding <= 0) return 0;
  await coinTransaction((tx) => changeCoins(tx, userId, outstanding, "BOOK_RESTORED", { fanficId, note: "Book restored" }));
  return outstanding;
}

export const COIN_REASON_LABEL: Record<CoinReason, string> = {
  BOOK_PUBLISHED: "Published a book",
  CHAPTER_PUBLISHED: "Published a chapter",
  BOOK_REMOVED: "Book removed",
  BOOK_RESTORED: "Book restored",
  ADMIN_GIVE: "Gift from the admin",
  ADMIN_TAKE: "Taken by the admin",
  THEME_PURCHASE: "Bought a theme",
};
