import "server-only";
import { prisma } from "@/lib/db";
import { awardCoinsForBook } from "@/lib/coins";
import { ageFrom, tooYoungFor } from "@/lib/content";

// "New book" and "new chapter" notifications for followers and Library savers,
// plus publishing scheduled chapters when their time comes.

/** Chapters readers can see: published with the book, or scheduled for a time that has passed. */
export function publishedChapterFilter(now = new Date()) {
  return { OR: [{ publishAt: null }, { publishAt: { lte: now } }] };
}

/** Recounts words and chapters over published chapters only. */
export async function recomputeBookCounts(fanficId: string) {
  const chapters = await prisma.chapter.findMany({
    where: { fanficId, ...publishedChapterFilter() },
    select: { wordCount: true },
  });
  await prisma.fanfic.update({
    where: { id: fanficId },
    data: { wordCount: chapters.reduce((n, c) => n + c.wordCount, 0), chapterCount: chapters.length },
  });
}

async function recipients(authorId: string, fanficId: string | null, rating: string | null): Promise<string[]> {
  const [followers, savers, blockers] = await Promise.all([
    prisma.follow.findMany({ where: { followingId: authorId }, select: { followerId: true } }),
    fanficId ? prisma.libraryEntry.findMany({ where: { fanficId }, select: { userId: true } }) : [],
    prisma.block.findMany({ where: { blockedId: authorId }, select: { blockerId: true } }),
  ]);
  const blocked = new Set(blockers.map((b) => b.blockerId));
  let ids = [...new Set([...followers.map((f) => f.followerId), ...savers.map((s) => s.userId)])].filter(
    (id) => id !== authorId && !blocked.has(id),
  );
  if (tooYoungFor(rating, 0) && ids.length) {
    // Don't tell readers about books they're too young to open.
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, birthDate: true } });
    const oldEnough = new Set(users.filter((u) => !tooYoungFor(rating, ageFrom(u.birthDate))).map((u) => u.id));
    ids = ids.filter((id) => oldEnough.has(id));
  }
  return ids;
}

/**
 * Tells followers about a newly public book, or followers and savers about
 * newly published chapters. Each book and chapter is announced once.
 */
export async function announceBook(fanficId: string) {
  const book = await prisma.fanfic.findUnique({
    where: { id: fanficId },
    select: { id: true, title: true, visibility: true, removed: true, rating: true, announcedAt: true, authorId: true, author: { select: { username: true } } },
  });
  if (!book || book.visibility !== "PUBLIC" || book.removed) return;

  const now = new Date();
  const fresh = await prisma.chapter.findMany({
    where: { fanficId, announcedAt: null, ...publishedChapterFilter(now) },
    orderBy: { order: "asc" },
    select: { id: true, order: true, title: true },
  });

  if (!book.announcedAt) {
    await prisma.fanfic.update({ where: { id: fanficId }, data: { announcedAt: now } });
    if (fresh.length) await prisma.chapter.updateMany({ where: { id: { in: fresh.map((c) => c.id) } }, data: { announcedAt: now } });
    const ids = await recipients(book.authorId, null, book.rating);
    if (ids.length) {
      await prisma.notification.createMany({
        data: ids.map((userId) => ({
          userId,
          kind: "NEW_BOOK",
          title: `@${book.author.username} posted a new book`,
          body: `“${book.title}” is out now.`,
          link: `/fanfic/${book.id}`,
          read: false,
        })),
      });
    }
    return;
  }

  if (fresh.length === 0) return;
  await prisma.chapter.updateMany({ where: { id: { in: fresh.map((c) => c.id) } }, data: { announcedAt: now } });
  await prisma.fanfic.update({ where: { id: fanficId }, data: { contentUpdatedAt: now } });
  const ids = await recipients(book.authorId, book.id, book.rating);
  if (ids.length === 0) return;
  const latest = fresh[fresh.length - 1];
  const all = await prisma.chapter.findMany({ where: { fanficId, ...publishedChapterFilter(now) }, orderBy: { order: "asc" }, select: { id: true } });
  const number = all.findIndex((c) => c.id === latest.id) + 1;
  const label = fresh.length === 1 ? `Chapter ${number}${latest.title ? `: ${latest.title}` : ""}` : `${fresh.length} new chapters`;
  await prisma.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      kind: "NEW_CHAPTER",
      title: `New chapter in “${book.title}”`,
      body: `${label} by @${book.author.username}.`,
      link: `/fanfic/${book.id}?ch=${number}&p=1`,
      read: false,
    })),
  });
}

/** Publishes scheduled chapters whose time has come: updates counts and notifies readers. */
export async function processDueChapters() {
  const due = await prisma.chapter.findMany({
    where: { announcedAt: null, publishAt: { lte: new Date() } },
    select: { fanficId: true },
    take: 500,
  });
  const books = [...new Set(due.map((c) => c.fanficId))];
  for (const id of books) {
    await recomputeBookCounts(id);
    await announceBook(id);
    // A scheduled chapter earns its coins when it comes out.
    await awardCoinsForBook(id);
  }
  return books.length;
}

let lastRun = 0;

/** Runs processDueChapters at most once a minute per server instance. Call from after(). */
export async function maybeProcessDueChapters() {
  if (Date.now() - lastRun < 60_000) return;
  lastRun = Date.now();
  try {
    await processDueChapters();
  } catch (error) {
    console.error("scheduled chapters failed", error);
  }
}
