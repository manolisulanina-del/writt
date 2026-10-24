"use server";

import type { ReactionType } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { prisma, isUniqueViolation } from "@/lib/db";
import { deleteCommentThread, removeIfOverReported } from "@/lib/moderation";
import { untilText } from "@/lib/notifications";
import { FEED_TAG, canView, getComments, type CommentData } from "@/lib/queries";
import { rateLimit, retryMessage } from "@/lib/rate-limit";
import { requireUser, type CurrentUser } from "@/lib/session";
import { isAdmin, requireAdmin } from "@/lib/auth/admin";
import { getViewerContext } from "@/lib/viewer";
import { getKidState, notifyParents } from "@/lib/family";
import { commentSchema, objectIdSchema, reportSchema } from "@/lib/validation";
import { z } from "zod";

/** Loads a story the user may interact with: visible to them and not a draft. */
async function interactable(fanficId: string, viewer: CurrentUser) {
  const id = objectIdSchema.safeParse(fanficId);
  if (!id.success) return null;
  const story = await prisma.fanfic.findUnique({
    where: { id: id.data },
    select: { id: true, visibility: true, authorId: true, removed: true, commentsLocked: true },
  });
  return story && story.visibility !== "DRAFT" && canView(story, { id: viewer.id, isAdmin: isAdmin(viewer) }) ? story : null;
}

/**
 * Kids' "comments off" setting: they can't post or read comments, and nobody
 * can comment on their books. Returns why comments are closed, or null.
 */
async function commentsClosed(viewer: CurrentUser, authorId: string): Promise<string | null> {
  if (isAdmin(viewer)) return null;
  if ((await getKidState(viewer.id))?.controls.commentsOff) return "Comments are turned off on your account.";
  if ((await getKidState(authorId))?.controls.commentsOff) return "Comments are turned off for this book.";
  return null;
}

// ---- Reactions ----

export type ReactionState = { mine: ReactionType | null; likeCount: number; dislikeCount: number };

/** Like and dislike are mutually exclusive; choosing the current one again removes it. */
export async function toggleReactionAction(fanficId: string, type: ReactionType): Promise<ReactionState | { error: string }> {
  const user = await requireUser();
  if (type !== "LIKE" && type !== "DISLIKE") return { error: "Invalid reaction." };
  const story = await interactable(fanficId, user);
  if (!story) return { error: "This story isn’t available." };

  const limit = await rateLimit(`react:${user.id}`, 60, 60_000);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds) };

  const counter = (t: ReactionType) => (t === "LIKE" ? "likeCount" : "dislikeCount");

  return prisma.$transaction(async (tx) => {
    const key = { userId_fanficId: { userId: user.id, fanficId: story.id } };
    const existing = await tx.reaction.findUnique({ where: key, select: { type: true } });
    let mine: ReactionType | null;

    if (existing?.type === type) {
      await tx.reaction.delete({ where: key });
      await tx.fanfic.update({ where: { id: story.id }, data: { [counter(type)]: { decrement: 1 } } });
      mine = null;
    } else if (existing) {
      await tx.reaction.update({ where: key, data: { type } });
      await tx.fanfic.update({
        where: { id: story.id },
        data: { [counter(type)]: { increment: 1 }, [counter(existing.type)]: { decrement: 1 } },
      });
      mine = type;
    } else {
      await tx.reaction.create({ data: { userId: user.id, fanficId: story.id, type } });
      await tx.fanfic.update({ where: { id: story.id }, data: { [counter(type)]: { increment: 1 } } });
      mine = type;
    }

    const counts = await tx.fanfic.findUniqueOrThrow({
      where: { id: story.id },
      select: { likeCount: true, dislikeCount: true },
    });
    return { mine, likeCount: Math.max(0, counts.likeCount), dislikeCount: Math.max(0, counts.dislikeCount) };
  });
}

// ---- Comments ----

type CommentRow = CommentData["replies"][number];
export type CommentView = Omit<CommentRow, "createdAt"> & { createdAt: string };
export type CommentThread = CommentView & { replies: CommentView[] };

const toView = (c: CommentRow): CommentView => ({ ...c, createdAt: c.createdAt.toISOString() });

export async function listCommentsAction(
  fanficId: string,
  before?: string,
): Promise<{ comments: CommentThread[]; hasMore: boolean; locked: boolean; isBookAuthor: boolean } | { error: string }> {
  const user = await requireUser();
  const story = await interactable(fanficId, user);
  if (!story) return { error: "Comments aren’t available for this story." };
  const closed = await commentsClosed(user, story.authorId);
  if (closed) return { error: closed };
  const ctx = await getViewerContext(user);
  const cursor = before ? new Date(before) : undefined;
  const take = 30;
  const rows = await getComments(story.id, ctx.blockedIds, take + 1, cursor && !Number.isNaN(cursor.getTime()) ? cursor : undefined);
  return {
    comments: rows.slice(0, take).map((r) => ({ ...toView(r), replies: r.replies.map(toView) })),
    hasMore: rows.length > take,
    locked: story.commentsLocked,
    isBookAuthor: story.authorId === user.id,
  };
}

const commentReturn = {
  id: true,
  body: true,
  createdAt: true,
  authorId: true,
  parentId: true,
  authorHeart: true,
  author: { select: { username: true, image: true, role: true } },
} as const;

/** Adds a comment, or a reply when `replyTo` is given (replies attach to the top-level comment). */
export async function addCommentAction(fanficId: string, body: string, replyTo?: string): Promise<{ comment: CommentView } | { error: string }> {
  const user = await requireUser();
  const parsed = commentSchema.safeParse({ fanficId, body });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const story = await interactable(parsed.data.fanficId, user);
  if (!story) return { error: "Comments aren’t available for this story." };
  const closed = await commentsClosed(user, story.authorId);
  if (closed) return { error: closed };
  const admin = isAdmin(user);
  if (story.commentsLocked && !admin) return { error: "Comments are turned off for this book." };
  if (user.mutedUntil && user.mutedUntil.getTime() > Date.now()) {
    return { error: `You can’t comment ${untilText(user.mutedUntil)}.` };
  }
  // Authors can block people from commenting on their books; blocks never apply to the admin.
  if (!admin && story.authorId !== user.id) {
    const blocked = await prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: story.authorId, blockedId: user.id } },
      select: { id: true },
    });
    if (blocked) return { error: "You can’t comment on this author’s books." };
  }

  let parentId: string | null = null;
  if (replyTo) {
    const parent = objectIdSchema.safeParse(replyTo);
    const target = parent.success
      ? await prisma.comment.findUnique({ where: { id: parent.data }, select: { id: true, fanficId: true, parentId: true } })
      : null;
    if (!target || target.fanficId !== story.id) return { error: "That comment no longer exists." };
    parentId = target.parentId ?? target.id; // one level deep
  }

  const burst = await rateLimit(`comment:${user.id}`, 5, 60_000);
  const hourly = burst.ok ? await rateLimit(`comment-h:${user.id}`, 60, 60 * 60_000) : burst;
  if (!hourly.ok) return { error: retryMessage(hourly.retryAfterSeconds).replace("Too many attempts", "You’re commenting too fast") };

  const [comment] = await prisma.$transaction([
    prisma.comment.create({
      data: { body: parsed.data.body, fanficId: story.id, authorId: user.id, parentId, authorHeart: false },
      select: commentReturn,
    }),
    prisma.fanfic.update({ where: { id: story.id }, data: { commentCount: { increment: 1 } } }),
  ]);
  return { comment: toView(comment) };
}

/** The book's author hearts or un-hearts a comment on their book. */
export async function toggleCommentHeartAction(commentId: string): Promise<{ hearted: boolean } | { error: string }> {
  const user = await requireUser();
  const id = objectIdSchema.safeParse(commentId);
  if (!id.success) return { error: "Comment not found." };
  const comment = await prisma.comment.findUnique({
    where: { id: id.data },
    select: { authorHeart: true, fanfic: { select: { authorId: true } } },
  });
  if (!comment) return { error: "Comment not found." };
  if (comment.fanfic.authorId !== user.id) return { error: "Only the book’s author can heart comments." };
  const closed = await commentsClosed(user, user.id);
  if (closed) return { error: closed };
  const updated = await prisma.comment.update({ where: { id: id.data }, data: { authorHeart: !comment.authorHeart }, select: { authorHeart: true } });
  return { hearted: updated.authorHeart };
}

/** Deletes a comment and its replies. Comment authors can delete their own; the admin can delete any. */
export async function deleteCommentAction(commentId: string): Promise<{ ok: true; removed: number } | { error: string }> {
  const user = await requireUser();
  const id = objectIdSchema.safeParse(commentId);
  if (!id.success) return { error: "Comment not found." };

  const comment = await prisma.comment.findUnique({ where: { id: id.data }, select: { authorId: true, fanficId: true } });
  if (!comment) return { error: "Comment not found." };
  if (comment.authorId !== user.id && !isAdmin(user)) return { error: "You can only delete your own comments." };

  const removed = await deleteCommentThread(id.data, comment.fanficId);
  return { ok: true, removed };
}

// ---- Reports ----

export async function reportAction(input: { fanficId: string; reason: string; details: string }): Promise<{ ok: true; removed: boolean } | { error: string; field?: string }> {
  const user = await requireUser();
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.message, field: issue.path[0]?.toString() };
  }

  const story = await interactable(parsed.data.fanficId, user);
  if (!story) return { error: "This story isn’t available." };
  if (story.authorId === user.id) return { error: "You can’t report your own story." };

  const limit = await rateLimit(`report:${user.id}`, 10, 60 * 60_000);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds) };

  try {
    await prisma.report.create({
      data: {
        fanficId: story.id,
        reporterId: user.id,
        reason: parsed.data.reason,
        details: parsed.data.details || null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "You’ve already reported this story. Our team will review it." };
    throw error;
  }
  // A child's parent hears about reports on their books (at most once a day per book).
  if (await getKidState(story.authorId)) {
    const once = await rateLimit(`parent-report-notice:${story.id}`, 1, 24 * 60 * 60_000);
    if (once.ok) {
      const book = await prisma.fanfic.findUnique({ where: { id: story.id }, select: { title: true, author: { select: { username: true } } } });
      if (book) {
        await notifyParents(story.authorId, {
          kind: "FAMILY",
          title: `${book.author.username}’s book was reported`,
          body: `Someone reported “${book.title}” by ${book.author.username}. The Writt admin reviews reports, and books with many reports are removed. You can read it in your family dashboard.`,
        });
      }
    }
  }
  // Expire the feed now so the removed book disappears for everyone. Unlike
  // updateTag, this doesn't re-render the reporter's page mid-confirmation.
  const removed = await removeIfOverReported(story.id);
  if (removed) revalidateTag(FEED_TAG, { expire: 0 });
  return { ok: true, removed };
}

export async function updateReportStatusAction(reportId: string, status: "OPEN" | "REVIEWED" | "DISMISSED") {
  const admin = await requireAdmin();
  const id = objectIdSchema.parse(reportId);
  const next = z.enum(["OPEN", "REVIEWED", "DISMISSED"]).parse(status);
  const report = await prisma.report.update({
    where: { id },
    data: {
      status: next,
      reviewedById: next === "OPEN" ? null : admin.id,
      reviewedAt: next === "OPEN" ? null : new Date(),
    },
    select: { fanficId: true, reason: true, fanfic: { select: { title: true } } },
  });
  await prisma.adminLog.create({
    data: {
      adminId: admin.id,
      command: `(reports tab) mark ${next.toLowerCase()}`,
      action: `report ${next.toLowerCase()}`,
      targetType: "report",
      targetId: id,
      targetLabel: `${report.fanfic.title} · ${report.reason.toLowerCase()}`,
    },
  });
  // Un-dismissing a report can push the book over the removal threshold.
  if (await removeIfOverReported(report.fanficId)) revalidateTag(FEED_TAG, { expire: 0 });
}
