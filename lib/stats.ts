import "server-only";
import { prisma, isObjectId } from "@/lib/db";

export const METRICS = [
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "dislikes", label: "Dislikes" },
  { key: "comments", label: "Comments" },
  { key: "saves", label: "Saves" },
  { key: "followers", label: "Followers gained" },
] as const;
export type MetricKey = (typeof METRICS)[number]["key"];
export type DayRow = { date: string } & Record<MetricKey, number>;

const DAYS = 30;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Totals and a 30-day daily series for one book. Only its author or the admin may see them. */
export async function getBookStats(fanficId: string, viewer: { id: string; isAdmin: boolean }) {
  if (!isObjectId(fanficId)) return null;
  const book = await prisma.fanfic.findUnique({
    where: { id: fanficId },
    select: { id: true, title: true, authorId: true, views: true, likeCount: true, dislikeCount: true, commentCount: true, saveCount: true, publishedAt: true },
  });
  if (!book || (book.authorId !== viewer.id && !viewer.isAdmin)) return null;

  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (DAYS - 1)));
  const since = { gte: start };
  const [views, reactions, comments, saves, follows, followersTotal] = await Promise.all([
    prisma.view.findMany({ where: { fanficId, createdAt: since }, select: { createdAt: true } }),
    prisma.reaction.findMany({ where: { fanficId, createdAt: since }, select: { createdAt: true, type: true } }),
    prisma.comment.findMany({ where: { fanficId, createdAt: since }, select: { createdAt: true } }),
    prisma.libraryEntry.findMany({ where: { fanficId, createdAt: since }, select: { createdAt: true } }),
    prisma.follow.findMany({ where: { sourceFanficId: fanficId, createdAt: since }, select: { createdAt: true } }),
    prisma.follow.count({ where: { sourceFanficId: fanficId } }),
  ]);

  const rows: DayRow[] = Array.from({ length: DAYS }, (_, i) => ({
    date: dayKey(new Date(start.getTime() + i * 24 * 60 * 60_000)),
    views: 0,
    likes: 0,
    dislikes: 0,
    comments: 0,
    saves: 0,
    followers: 0,
  }));
  const byDay = new Map(rows.map((r) => [r.date, r]));
  const add = (d: Date, key: MetricKey) => {
    const row = byDay.get(dayKey(d));
    if (row) row[key]++;
  };
  views.forEach((v) => add(v.createdAt, "views"));
  reactions.forEach((r) => add(r.createdAt, r.type === "LIKE" ? "likes" : "dislikes"));
  comments.forEach((c) => add(c.createdAt, "comments"));
  saves.forEach((s) => add(s.createdAt, "saves"));
  follows.forEach((f) => add(f.createdAt, "followers"));

  return {
    book: { id: book.id, title: book.title },
    totals: {
      views: book.views,
      likes: book.likeCount,
      dislikes: book.dislikeCount,
      comments: book.commentCount,
      saves: book.saveCount,
      followers: followersTotal,
    } satisfies Record<MetricKey, number>,
    days: rows,
  };
}
