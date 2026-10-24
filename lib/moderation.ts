import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { isAdmin } from "@/lib/auth/admin-identity";
import { giveBackBookCoins, takeBackBookCoins } from "@/lib/coins";
import { notifyParents } from "@/lib/family";
import { notify, untilText } from "@/lib/notifications";
import { getSiteSettings } from "@/lib/settings";
import { deleteStoredUrls } from "@/lib/storage";
import { isStorageUrl } from "@/lib/storage/types";

/** Image URLs a book owns: its cover and every picture in its pages. */
async function bookImageUrls(fanficId: string): Promise<string[]> {
  const book = await prisma.fanfic.findUnique({
    where: { id: fanficId },
    select: { coverUrl: true, chapters: { select: { pages: { select: { content: true } } } } },
  });
  if (!book) return [];
  const urls = new Set<string>();
  if (book.coverUrl) urls.add(book.coverUrl);
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; attrs?: { src?: unknown }; content?: unknown[] };
    if (n.type === "image" && typeof n.attrs?.src === "string" && isStorageUrl(n.attrs.src)) urls.add(n.attrs.src);
    n.content?.forEach(walk);
  };
  book.chapters.forEach((c) => c.pages.forEach((p) => walk(p.content)));
  return [...urls];
}

/** Deletes a book and everything attached to it. Run inside a transaction. */
export async function deleteFanficCompletely(tx: Prisma.TransactionClient, fanficId: string) {
  const chapters = await tx.chapter.findMany({ where: { fanficId }, select: { id: true } });
  await tx.page.deleteMany({ where: { chapterId: { in: chapters.map((c) => c.id) } } });
  await tx.chapter.deleteMany({ where: { fanficId } });
  await deleteComments(tx, { fanficId });
  await tx.bookTag.deleteMany({ where: { fanficId } });
  await tx.libraryEntry.deleteMany({ where: { fanficId } });
  await tx.readingProgress.deleteMany({ where: { fanficId } });
  await tx.follow.updateMany({ where: { sourceFanficId: fanficId }, data: { sourceFanficId: null } });
  await tx.reaction.deleteMany({ where: { fanficId } });
  await tx.view.deleteMany({ where: { fanficId } });
  await tx.report.deleteMany({ where: { fanficId } });
  const appeals = await tx.appeal.findMany({ where: { fanficId }, select: { id: true } });
  await tx.appealMessage.deleteMany({ where: { appealId: { in: appeals.map((a) => a.id) } } });
  await tx.appeal.deleteMany({ where: { fanficId } });
  await tx.fanfic.delete({ where: { id: fanficId } });
}

/**
 * Deletes the matching comments and every reply to them. Replies go first: a
 * comment can't be deleted while replies still point at it. Returns what was deleted.
 */
export async function deleteComments(tx: Prisma.TransactionClient, where: Prisma.CommentWhereInput) {
  const matched = await tx.comment.findMany({ where, select: { id: true, fanficId: true, parentId: true } });
  if (!matched.length) return [];
  const ids = new Set(matched.map((c) => c.id));
  const replies = await tx.comment.findMany({ where: { parentId: { in: [...ids] } }, select: { id: true, fanficId: true, parentId: true } });
  const all = [...matched, ...replies.filter((r) => !ids.has(r.id))];
  const replyIds = all.filter((c) => c.parentId).map((c) => c.id);
  const topIds = all.filter((c) => !c.parentId).map((c) => c.id);
  if (replyIds.length) await tx.comment.deleteMany({ where: { id: { in: replyIds } } });
  if (topIds.length) await tx.comment.deleteMany({ where: { id: { in: topIds } } });
  return all;
}

/** Deletes a comment and its replies, keeping the book's comment count right. Returns how many were deleted. */
export async function deleteCommentThread(commentId: string, fanficId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const removed = await deleteComments(tx, { id: commentId });
    await tx.fanfic.update({ where: { id: fanficId }, data: { commentCount: { decrement: removed.length } } });
    return removed.length;
  });
}

/** Permanently deletes a book, its images and everything attached to it. */
export async function deleteBookAndImages(fanficId: string) {
  const urls = await bookImageUrls(fanficId);
  await prisma.$transaction((tx) => deleteFanficCompletely(tx, fanficId), { timeout: 30_000 });
  await deleteStoredUrls(urls);
}

/** Hides a book from everyone but the admin, and takes back the coins it earned. It can be restored later. */
export async function softRemoveBook(fanficId: string, reason: string) {
  const book = await prisma.fanfic.update({
    where: { id: fanficId },
    data: { removed: true, removedAt: new Date(), removedReason: reason, featured: false },
    select: { id: true, title: true, authorId: true },
  });
  return { ...book, coinsTaken: await takeBackBookCoins(fanficId) };
}

/** Brings a removed book back, with the coins that were taken when it was removed. */
export async function restoreBook(fanficId: string) {
  const book = await prisma.fanfic.update({
    where: { id: fanficId },
    data: { removed: false, removedAt: null, removedReason: null },
    select: { id: true, title: true, authorId: true },
  });
  return { ...book, coinsBack: await giveBackBookCoins(fanficId) };
}

/** " We took back the 60 coins it earned." for removal notices, or "". */
export function coinsTakenText(coins: number): string {
  return coins > 0 ? ` We took back the ${coins} coin${coins === 1 ? "" : "s"} it earned.` : "";
}

export async function getReportThreshold(): Promise<number> {
  return (await getSiteSettings()).reportThreshold;
}

/**
 * Removes the book once its reports reach the threshold, and blocks its author
 * from creating books for `creationBlockDays`. Dismissed reports don't count,
 * and the admin's books are never removed this way. Returns true if removed.
 */
export async function removeIfOverReported(fanficId: string): Promise<boolean> {
  const count = await prisma.report.count({ where: { fanficId, status: { not: "DISMISSED" } } });
  if (count < (await getReportThreshold())) return false;

  const book = await prisma.fanfic.findUnique({
    where: { id: fanficId },
    select: { removed: true, title: true, authorId: true, author: { select: { role: true, email: true } } },
  });
  if (!book || book.removed) return false;
  if (isAdmin({ id: book.authorId, ...book.author })) return false;

  const { coinsTaken } = await softRemoveBook(fanficId, `Removed automatically after being reported ${count} times.`);
  const until = new Date(Date.now() + config.creationBlockDays * 24 * 60 * 60_000);
  await prisma.user.update({
    where: { id: book.authorId },
    data: {
      createBlockedUntil: until,
      createBlockReason: `Your book “${book.title}” was removed after being reported ${count} times.`,
      createBlockKind: "REPORTS",
    },
  });
  await notify(book.authorId, {
    kind: "BOOK_REMOVED",
    title: `“${book.title}” was removed`,
    body: `Your book was removed after being reported ${count} times.${coinsTakenText(coinsTaken)} You can’t create new books ${untilText(until)}. If you think this was unfair, you can appeal.`,
    link: `/appeals/new?book=${fanficId}`,
  });
  await notifyParents(book.authorId, {
    kind: "FAMILY",
    title: `“${book.title}” was removed`,
    body: `Your child’s book “${book.title}” was removed after being reported ${count} times.${coinsTakenText(coinsTaken)}`,
  });
  return true;
}

export type CreationBlock = { until: Date; reason: string | null };

/** The user's active creation block, or null if they may create books. */
export async function getCreationBlock(userId: string): Promise<CreationBlock | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createBlockedUntil: true, createBlockReason: true },
  });
  if (!user?.createBlockedUntil || user.createBlockedUntil.getTime() <= Date.now()) return null;
  return { until: user.createBlockedUntil, reason: user.createBlockReason };
}

/** "November 5, 2026 at 3:00 PM UTC" — server-side messages use UTC; pages show local time. */
export function formatBlockDate(date: Date): string {
  return `${date.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" })} UTC`;
}
