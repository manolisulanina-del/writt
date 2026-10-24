"use server";

import { prisma, isObjectId, isUniqueViolation } from "@/lib/db";
import { canView } from "@/lib/queries";
import { requireUser, type CurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";

async function viewable(fanficId: string, user: CurrentUser) {
  if (!isObjectId(fanficId)) return null;
  const story = await prisma.fanfic.findUnique({ where: { id: fanficId }, select: { id: true, visibility: true, authorId: true, removed: true } });
  return story && canView(story, { id: user.id, isAdmin: isAdmin(user) }) ? story : null;
}

/** Adds a book to the user's Library, or takes it out. */
export async function toggleSaveAction(fanficId: string): Promise<{ saved: boolean } | { error: string }> {
  const user = await requireUser();
  const story = await viewable(fanficId, user);
  if (!story || story.visibility === "DRAFT") return { error: "This book isn’t available." };

  const key = { userId_fanficId: { userId: user.id, fanficId: story.id } };
  const existing = await prisma.libraryEntry.findUnique({ where: key, select: { id: true } });
  if (existing) {
    await prisma.$transaction([
      prisma.libraryEntry.delete({ where: key }),
      prisma.fanfic.update({ where: { id: story.id }, data: { saveCount: { decrement: 1 } } }),
    ]);
    return { saved: false };
  }
  try {
    await prisma.$transaction([
      prisma.libraryEntry.create({ data: { userId: user.id, fanficId: story.id } }),
      prisma.fanfic.update({ where: { id: story.id }, data: { saveCount: { increment: 1 } } }),
    ]);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return { saved: true };
}

/** Remembers the last page read, for "Continue reading". */
export async function saveProgressAction(fanficId: string, chapterId: string, pageIndex: number) {
  const user = await requireUser();
  if (!isObjectId(chapterId) || !Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 5000) return;
  const story = await viewable(fanficId, user);
  if (!story) return;
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, fanficId: story.id }, select: { id: true } });
  if (!chapter) return;
  await prisma.readingProgress.upsert({
    where: { userId_fanficId: { userId: user.id, fanficId: story.id } },
    create: { userId: user.id, fanficId: story.id, chapterId, pageIndex },
    update: { chapterId, pageIndex },
  });
}
