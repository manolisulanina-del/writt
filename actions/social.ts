"use server";

import { revalidatePath } from "next/cache";
import { prisma, isObjectId, isUniqueViolation } from "@/lib/db";
import { rateLimit, retryMessage } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";
import { getKidState } from "@/lib/family";

async function findTarget(username: string) {
  return prisma.user.findUnique({
    where: { username: String(username).toLowerCase().replace(/^@/, "") },
    select: { id: true, username: true, role: true, email: true, needsSetup: true },
  });
}

/** Follow or unfollow an author. `sourceFanficId` records the book the follow came from (writer stats). */
export async function toggleFollowAction(username: string, sourceFanficId?: string): Promise<{ following: boolean; followers: number } | { error: string }> {
  const user = await requireUser();
  const target = await findTarget(username);
  if (!target || target.needsSetup) return { error: "User not found." };
  if (target.id === user.id) return { error: "You can’t follow yourself." };

  const key = { followerId_followingId: { followerId: user.id, followingId: target.id } };
  const existing = await prisma.follow.findUnique({ where: key, select: { id: true } });
  if (existing) {
    await prisma.follow.delete({ where: key });
  } else {
    // Kids' "no following" setting works both ways: they can't follow, and nobody can follow them.
    if ((await getKidState(user.id))?.controls.noFollow) return { error: "Following is turned off on your account." };
    if (!isAdmin(user) && (await getKidState(target.id))?.controls.noFollow) return { error: "This account can’t be followed." };
    const limit = await rateLimit(`follow:${user.id}`, 60, 60 * 60_000);
    if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds) };
    const blocked = await prisma.block.findFirst({
      where: { OR: [{ blockerId: target.id, blockedId: user.id }, { blockerId: user.id, blockedId: target.id }] },
      select: { id: true },
    });
    if (blocked && !isAdmin(user)) return { error: "You can’t follow this user." };
    const source = sourceFanficId && isObjectId(sourceFanficId)
      ? await prisma.fanfic.findFirst({ where: { id: sourceFanficId, authorId: target.id }, select: { id: true } })
      : null;
    try {
      await prisma.follow.create({ data: { followerId: user.id, followingId: target.id, sourceFanficId: source?.id ?? null } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  const followers = await prisma.follow.count({ where: { followingId: target.id } });
  revalidatePath(`/u/${target.username}`);
  return { following: !existing, followers };
}

/** Blocks a user: they can't comment on your books, and their books and comments are hidden from you. */
export async function blockUserAction(username: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const target = await findTarget(username);
  if (!target) return { error: "User not found." };
  if (target.id === user.id) return { error: "You can’t block yourself." };
  if (isAdmin(target)) return { error: "The Writt admin can’t be blocked." };

  try {
    await prisma.block.create({ data: { blockerId: user.id, blockedId: target.id } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  // Blocking also ends follows in both directions.
  await prisma.follow.deleteMany({
    where: { OR: [{ followerId: user.id, followingId: target.id }, { followerId: target.id, followingId: user.id }] },
  });
  revalidatePath(`/u/${target.username}`);
  return { ok: true };
}

export async function unblockUserAction(username: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const target = await findTarget(username);
  if (!target) return { error: "User not found." };
  await prisma.block.deleteMany({ where: { blockerId: user.id, blockedId: target.id } });
  revalidatePath("/settings");
  revalidatePath(`/u/${target.username}`);
  return { ok: true };
}
