import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Prisma, TagKind, Visibility } from "@prisma/client";
import { prisma, isObjectId } from "@/lib/db";
import { config } from "@/lib/config";
import { LENGTHS, type SortValue } from "@/lib/content";
import { publishedChapterFilter } from "@/lib/announce";
import { allowedForViewer, bookFilter, type ViewerContext } from "@/lib/viewer";

export const FEED_TAG = "feed";

const cardSelect = {
  id: true,
  title: true,
  excerpt: true,
  summary: true,
  coverUrl: true,
  views: true,
  likeCount: true,
  commentCount: true,
  visibility: true,
  updatedAt: true,
  contentUpdatedAt: true,
  rating: true,
  warnings: true,
  status: true,
  wordCount: true,
  chapterCount: true,
  removed: true,
  featured: true,
  hotMode: true,
  authorId: true,
  author: { select: { username: true, image: true, role: true } },
} satisfies Prisma.FanficSelect;

/** Shown to everyone: public and not removed by moderation. */
const LISTED = { visibility: "PUBLIC", removed: false } satisfies Prisma.FanficWhereInput;

type CardRow = Prisma.FanficGetPayload<{ select: typeof cardSelect }>;
export type FanficCardData = CardRow & { hot: boolean };

async function hotIds(): Promise<Set<string>> {
  if (config.hotTopN === 0) return new Set();
  const top = await prisma.fanfic.findMany({
    where: { ...LISTED, views: { gt: 0 }, hotMode: { not: "OFF" } },
    orderBy: { views: "desc" },
    take: config.hotTopN,
    select: { id: true },
  });
  return new Set(top.map((f) => f.id));
}

async function withHot(rows: CardRow[]): Promise<FanficCardData[]> {
  const top = await hotIds();
  // The admin's /hot and /unhot override the automatic rule.
  return rows.map((row) => ({
    ...row,
    hot:
      row.visibility === "PUBLIC" &&
      !row.removed &&
      (row.hotMode === "ON" || (row.hotMode === "AUTO" && (top.has(row.id) || row.views >= config.hotViewThreshold))),
  }));
}

// ---- Shared feeds (cached for everyone, then filtered per viewer) ----

async function cachedFeed(kind: "featured" | "popular" | "latest") {
  "use cache";
  cacheLife("minutes");
  cacheTag(FEED_TAG);
  const rows = await prisma.fanfic.findMany({
    where: kind === "featured" ? { ...LISTED, featured: true } : LISTED,
    orderBy:
      kind === "featured" ? { featuredAt: "desc" } : kind === "popular" ? [{ views: "desc" }, { likeCount: "desc" }] : { publishedAt: "desc" },
    take: kind === "featured" ? 16 : 60,
    select: cardSelect,
  });
  return withHot(rows);
}

async function feedFor(kind: "featured" | "popular" | "latest", ctx: ViewerContext, take: number) {
  return (await cachedFeed(kind)).filter((b) => allowedForViewer(b, ctx, true)).slice(0, take);
}

export const getFeatured = (ctx: ViewerContext) => feedFor("featured", ctx, 8);
export const getPopular = (ctx: ViewerContext) => feedFor("popular", ctx, 12);
export const getLatest = (ctx: ViewerContext) => feedFor("latest", ctx, 12);

/** Fandoms or tags with the most public books. */
export async function getTopTags(kind: TagKind, take: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag(FEED_TAG);
  const listed = await prisma.fanfic.findMany({ where: LISTED, select: { id: true } });
  if (listed.length === 0) return [];
  const links = await prisma.bookTag.findMany({
    where: { fanficId: { in: listed.map((b) => b.id) }, tag: { kind } },
    select: { tagId: true },
  });
  const counts = new Map<string, number>();
  links.forEach((l) => counts.set(l.tagId, (counts.get(l.tagId) ?? 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, take);
  const tags = await prisma.tag.findMany({ where: { id: { in: top.map(([id]) => id) } }, select: { id: true, name: true } });
  return top.flatMap(([id, books]) => {
    const tag = tags.find((x) => x.id === id);
    return tag ? [{ ...tag, books }] : [];
  });
}

// ---- Browse / search ----

export type BrowseFilters = {
  q?: string;
  tagIds?: string[];
  rating?: string;
  status?: string;
  length?: string;
  sort?: SortValue;
};

const SORT_ORDER: Record<SortValue, Prisma.FanficOrderByWithRelationInput[]> = {
  hot: [{ views: "desc" }, { likeCount: "desc" }],
  new: [{ publishedAt: "desc" }],
  liked: [{ likeCount: "desc" }, { views: "desc" }],
  updated: [{ contentUpdatedAt: "desc" }],
};

/** Public books matching a search and filters, respecting the viewer's blocks, age and feed settings. */
export async function browseBooks(filters: BrowseFilters, ctx: ViewerContext, take = 48) {
  const and: Prisma.FanficWhereInput[] = [LISTED, bookFilter(ctx, true)];

  const q = filters.q?.trim().slice(0, 100);
  if (q) {
    const lower = q.toLowerCase().replace(/^@/, "").replace(/\s+/g, " ");
    const [authors, tags] = await Promise.all([
      prisma.user.findMany({ where: { username: { contains: lower } }, select: { id: true }, take: 50 }),
      prisma.tag.findMany({ where: { key: { contains: lower } }, select: { id: true }, take: 50 }),
    ]);
    const tagged = tags.length
      ? await prisma.bookTag.findMany({ where: { tagId: { in: tags.map((t) => t.id) } }, select: { fanficId: true } })
      : [];
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { authorId: { in: authors.map((a) => a.id) } },
        { id: { in: tagged.map((t) => t.fanficId) } },
      ],
    });
  }
  for (const tagId of (filters.tagIds ?? []).filter(isObjectId)) {
    const rows = await prisma.bookTag.findMany({ where: { tagId }, select: { fanficId: true } });
    and.push({ id: { in: rows.map((r) => r.fanficId) } });
  }
  if (filters.rating === "EVERYONE" || filters.rating === "TEEN" || filters.rating === "MATURE") and.push({ rating: filters.rating });
  if (filters.status === "ONGOING" || filters.status === "COMPLETED") and.push({ status: filters.status });
  const length = LENGTHS.find((l) => l.value === filters.length);
  if (length) and.push({ wordCount: { gte: length.min, lt: length.max } });

  const rows = await prisma.fanfic.findMany({
    where: { AND: and },
    orderBy: SORT_ORDER[filters.sort ?? "hot"] ?? SORT_ORDER.hot,
    take,
    select: cardSelect,
  });
  return withHot(rows);
}

export async function getTag(id: string) {
  if (!isObjectId(id)) return null;
  const tag = await prisma.tag.findUnique({
    where: { id },
    select: { id: true, name: true, kind: true, createdAt: true, createdBy: { select: { username: true, role: true } } },
  });
  if (!tag) return null;
  const links = await prisma.bookTag.findMany({ where: { tagId: id }, select: { fanficId: true } });
  const books = await prisma.fanfic.count({ where: { ...LISTED, id: { in: links.map((l) => l.fanficId) } } });
  return { ...tag, books };
}

// ---- Personal rows ----

/** New books and chapters from authors the viewer follows, most recently updated first. */
export async function getFollowingFeed(ctx: ViewerContext, take = 24) {
  const follows = await prisma.follow.findMany({ where: { followerId: ctx.id }, select: { followingId: true } });
  if (follows.length === 0) return { following: 0, books: [] };
  const rows = await prisma.fanfic.findMany({
    where: { AND: [LISTED, bookFilter(ctx, true), { authorId: { in: follows.map((f) => f.followingId) } }] },
    orderBy: { contentUpdatedAt: "desc" },
    take,
    select: cardSelect,
  });
  return { following: follows.length, books: await withHot(rows) };
}

/** Books the viewer is partway through, with the exact chapter and page to return to. */
export async function getContinueReading(ctx: ViewerContext, take = 8) {
  const progress = await prisma.readingProgress.findMany({
    where: { userId: ctx.id },
    orderBy: { updatedAt: "desc" },
    take: take * 2,
    select: { fanficId: true, chapterId: true, pageIndex: true },
  });
  if (progress.length === 0) return [];
  const ids = progress.map((p) => p.fanficId);
  const [books, chapters] = await Promise.all([
    prisma.fanfic.findMany({ where: { id: { in: ids }, removed: false }, select: cardSelect }),
    prisma.chapter.findMany({
      where: { fanficId: { in: ids }, ...publishedChapterFilter() },
      orderBy: { order: "asc" },
      select: { id: true, fanficId: true },
    }),
  ]);
  const cards = await withHot(books);
  return progress
    .flatMap((p) => {
      const book = cards.find((b) => b.id === p.fanficId);
      if (!book || !allowedForViewer(book, ctx, false)) return [];
      if (book.visibility !== "PUBLIC" && book.authorId !== ctx.id) return [];
      const list = chapters.filter((c) => c.fanficId === p.fanficId);
      const index = list.findIndex((c) => c.id === p.chapterId);
      if (index < 0) return [];
      return [{ book, href: `/fanfic/${book.id}?ch=${index + 1}&p=${p.pageIndex + 1}`, label: `Chapter ${index + 1} · page ${p.pageIndex + 1}` }];
    })
    .slice(0, take);
}

export async function getLibrary(ctx: ViewerContext) {
  const entries = await prisma.libraryEntry.findMany({ where: { userId: ctx.id }, orderBy: { createdAt: "desc" }, select: { fanficId: true } });
  if (entries.length === 0) return [];
  const rows = await prisma.fanfic.findMany({ where: { id: { in: entries.map((e) => e.fanficId) }, removed: false }, select: cardSelect });
  const cards = await withHot(rows);
  return entries.flatMap((e) => {
    const b = cards.find((c) => c.id === e.fanficId);
    return b && (b.visibility === "PUBLIC" || b.authorId === ctx.id) && allowedForViewer(b, ctx, false) ? [b] : [];
  });
}

// ---- Profile ----

export async function getProfile(username: string, viewerId: string) {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true,
      username: true,
      nickname: true,
      image: true,
      bio: true,
      createdAt: true,
      needsSetup: true,
      role: true,
      bannedUntil: true,
      mutedUntil: true,
      createBlockedUntil: true,
      kind: true,
    },
  });
  if (!user || user.needsSetup || user.kind === "FAMILY") return null;

  const [stats, followers, following, isFollowing, iBlocked] = await Promise.all([
    prisma.fanfic.aggregate({ where: { authorId: user.id, ...LISTED }, _count: { _all: true }, _sum: { views: true, likeCount: true } }),
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
    prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: user.id } }, select: { id: true } }),
    prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId: viewerId, blockedId: user.id } }, select: { id: true } }),
  ]);
  return {
    ...user,
    isFollowing: Boolean(isFollowing),
    iBlocked: Boolean(iBlocked),
    stats: {
      stories: stats._count._all,
      views: stats._sum.views ?? 0,
      likes: stats._sum.likeCount ?? 0,
      followers,
      following,
    },
  };
}

/**
 * Stories by an author. Non-public tabs are only returned to the author
 * themselves, who also sees their removed books (marked, with an appeal link).
 */
export async function getAuthorFanfics(authorId: string, visibility: Visibility, ctx: ViewerContext) {
  const isOwner = authorId === ctx.id;
  if (visibility !== "PUBLIC" && !isOwner) return [];
  const rows = await prisma.fanfic.findMany({
    where: { authorId, visibility, ...(isOwner ? {} : { AND: [{ removed: false }, bookFilter(ctx, false)] }) },
    orderBy: visibility === "PUBLIC" ? { publishedAt: "desc" } : { updatedAt: "desc" },
    select: cardSelect,
  });
  return withHot(rows);
}

// ---- Reader ----

/**
 * `isAdmin` must come from lib/auth/admin.ts (never from a stored role or anything
 * the client sends); `childIds` from the viewer's family links (lib/family.ts).
 */
export type Viewer = { id: string; isAdmin: boolean; childIds?: string[] };

/**
 * Who may open a story: the admin always; nobody else once it's removed;
 * otherwise anyone if public, or only its author and the author's parent.
 */
export function canView(story: { visibility: Visibility; authorId: string; removed: boolean }, viewer: Viewer): boolean {
  if (viewer.isAdmin) return true;
  if (story.removed) return false;
  return story.visibility === "PUBLIC" || story.authorId === viewer.id || Boolean(viewer.childIds?.includes(story.authorId));
}

/** For an author opening their own removed book: what to show instead of the book. */
export async function getRemovedNotice(id: string, viewerId: string) {
  if (!isObjectId(id)) return null;
  return prisma.fanfic.findFirst({
    where: { id, authorId: viewerId, removed: true },
    select: { id: true, title: true, removedReason: true, removedAt: true },
  });
}

async function loadReader(id: string, ctx: ViewerContext, chapterNo: number, pageNo: number) {
  const story = await prisma.fanfic.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      summary: true,
      coverUrl: true,
      musicUrl: true,
      musicVolume: true,
      visibility: true,
      views: true,
      likeCount: true,
      dislikeCount: true,
      commentCount: true,
      saveCount: true,
      rating: true,
      warnings: true,
      status: true,
      authorId: true,
      publishedAt: true,
      updatedAt: true,
      removed: true,
      removedReason: true,
      featured: true,
      hotMode: true,
      commentsLocked: true,
      awaitingApproval: true,
      author: { select: { username: true, image: true, role: true } },
      tags: { select: { tag: { select: { id: true, name: true, kind: true } } } },
      chapters: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          title: true,
          noteStart: true,
          noteEnd: true,
          publishAt: true,
          wordCount: true,
          pages: { orderBy: { order: "asc" }, select: { id: true } },
        },
      },
    },
  });
  if (!story || !canView(story, ctx)) return null;

  // Readers only see published chapters; the author and admin also see scheduled ones.
  const now = Date.now();
  const isPublished = (c: { publishAt: Date | null }) => !c.publishAt || c.publishAt.getTime() <= now;
  const preview = story.authorId === ctx.id || ctx.isAdmin || ctx.childIds.includes(story.authorId);
  const chapters = story.chapters.filter((c) => preview || isPublished(c));

  const chapterIndex = Math.min(Math.max(chapterNo, 1), Math.max(chapters.length, 1)) - 1;
  const chapter = chapters[chapterIndex];
  const pageIndex = chapter ? Math.min(Math.max(pageNo, 1), Math.max(chapter.pages.length, 1)) - 1 : 0;
  const pageId = chapter?.pages[pageIndex]?.id;

  const [page, reaction, report, saved, following] = await Promise.all([
    pageId ? prisma.page.findUnique({ where: { id: pageId }, select: { content: true } }) : null,
    prisma.reaction.findUnique({ where: { userId_fanficId: { userId: ctx.id, fanficId: id } }, select: { type: true } }),
    prisma.report.findUnique({ where: { reporterId_fanficId: { reporterId: ctx.id, fanficId: id } }, select: { id: true } }),
    prisma.libraryEntry.findUnique({ where: { userId_fanficId: { userId: ctx.id, fanficId: id } }, select: { id: true } }),
    prisma.follow.findUnique({ where: { followerId_followingId: { followerId: ctx.id, followingId: story.authorId } }, select: { id: true } }),
  ]);

  const published = chapters.filter(isPublished);
  return {
    story: { ...story, chapters, tags: story.tags.map((t) => t.tag) },
    position: { chapterIndex, pageIndex },
    content: page?.content ?? null,
    myReaction: reaction?.type ?? null,
    hasReported: Boolean(report),
    saved: Boolean(saved),
    followingAuthor: Boolean(following),
    words: published.reduce((n, c) => n + c.wordCount, 0),
    publishedChapters: published.length,
  };
}

export type ReaderData = NonNullable<Awaited<ReturnType<typeof loadReader>>>;
export type ReaderResult =
  | { kind: "ok"; data: ReaderData }
  | { kind: "minor"; rating: string; family: boolean }
  | { kind: "blocked" }
  | null;

export async function getFanficForReader(id: string, ctx: ViewerContext, chapterNo: number, pageNo: number): Promise<ReaderResult> {
  if (!isObjectId(id)) return null;
  const data = await loadReader(id, ctx, chapterNo, pageNo);
  if (!data) return null;
  const isAuthor = data.story.authorId === ctx.id;
  if (!isAuthor && data.story.rating && (ctx.hiddenRatings as string[]).includes(data.story.rating)) {
    return { kind: "minor", rating: data.story.rating, family: Boolean(ctx.kid) };
  }
  if (!isAuthor && ctx.blockedIds.includes(data.story.authorId)) return { kind: "blocked" };
  return { kind: "ok", data };
}

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  authorId: true,
  parentId: true,
  authorHeart: true,
  author: { select: { username: true, image: true, role: true } },
} as const;

/** Top-level comments, newest first, each with its replies oldest first. Hides authors the viewer blocked. */
export async function getComments(fanficId: string, hiddenAuthorIds: string[], take = 30, before?: Date) {
  const notBlocked = hiddenAuthorIds.length ? { authorId: { notIn: hiddenAuthorIds } } : {};
  const roots = await prisma.comment.findMany({
    where: { fanficId, parentId: null, ...notBlocked, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    select: commentSelect,
  });
  const replies = roots.length
    ? await prisma.comment.findMany({
        where: { parentId: { in: roots.map((r) => r.id) }, ...notBlocked },
        orderBy: { createdAt: "asc" },
        select: commentSelect,
      })
    : [];
  return roots.map((r) => ({ ...r, replies: replies.filter((x) => x.parentId === r.id) }));
}

export type CommentData = Awaited<ReturnType<typeof getComments>>[number];

// ---- Editor ----

export async function getFanficForEditing(id: string, authorId: string) {
  if (!isObjectId(id)) return null;
  return prisma.fanfic.findFirst({
    where: { id, authorId, removed: false },
    select: {
      id: true,
      title: true,
      summary: true,
      coverUrl: true,
      musicUrl: true,
      musicVolume: true,
      visibility: true,
      rating: true,
      warnings: true,
      status: true,
      updatedAt: true,
      tags: { select: { tag: { select: { id: true, name: true, kind: true } } } },
      chapters: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          noteStart: true,
          noteEnd: true,
          publishAt: true,
          pages: { orderBy: { order: "asc" }, select: { content: true } },
        },
      },
    },
  });
}
