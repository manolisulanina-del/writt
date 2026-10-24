import "server-only";
import { prisma } from "@/lib/db";
import { CONSENT_DAYS } from "@/lib/kids";
import { deleteBookAndImages, deleteComments } from "@/lib/moderation";
import { deleteStoredUrls } from "@/lib/storage";

/**
 * Deletes an account and everything it posted, keeping other books' counters
 * right. Used by the admin's /deleteuser, by parents deleting a child's
 * account, and for kids' accounts nobody approved in time.
 */
export async function deleteUserCompletely(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { image: true } });
  if (!user) return;
  const books = await prisma.fanfic.findMany({ where: { authorId: userId }, select: { id: true } });
  for (const b of books) await deleteBookAndImages(b.id);

  const reactions = await prisma.reaction.findMany({ where: { userId }, select: { fanficId: true, type: true } });
  const tally = new Map<string, { comments: number; likes: number; dislikes: number }>();
  const bump = (id: string) => tally.get(id) ?? tally.set(id, { comments: 0, likes: 0, dislikes: 0 }).get(id)!;
  reactions.forEach((r) => (r.type === "LIKE" ? bump(r.fanficId).likes++ : bump(r.fanficId).dislikes++));

  // Children of a parent account that's going away need a parent again.
  const children = await prisma.familyLink.findMany({ where: { parentId: userId }, select: { childId: true } });

  await prisma.$transaction(
    async (tx) => {
      // Their comments go with any replies other people left on them.
      const comments = await deleteComments(tx, { authorId: userId });
      comments.forEach((c) => bump(c.fanficId).comments++);
      for (const [fanficId, t] of tally) {
        await tx.fanfic.updateMany({
          where: { id: fanficId },
          data: { commentCount: { decrement: t.comments }, likeCount: { decrement: t.likes }, dislikeCount: { decrement: t.dislikes } },
        });
      }
      await tx.reaction.deleteMany({ where: { userId } });
      await tx.view.deleteMany({ where: { userId } });
      await tx.report.deleteMany({ where: { reporterId: userId } });
      const appeals = await tx.appeal.findMany({ where: { userId }, select: { id: true } });
      await tx.appealMessage.deleteMany({ where: { OR: [{ appealId: { in: appeals.map((a) => a.id) } }, { authorId: userId }] } });
      await tx.appeal.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      // Family, coins and themes.
      await tx.familyLink.deleteMany({ where: { OR: [{ parentId: userId }, { childId: userId }] } });
      await tx.consentRequest.deleteMany({ where: { childId: userId } });
      await tx.consentRecord.deleteMany({ where: { OR: [{ parentId: userId }, { childId: userId }] } });
      await tx.loginToken.deleteMany({ where: { userId } });
      await tx.coinTransaction.deleteMany({ where: { userId } });
      await tx.coinEarning.deleteMany({ where: { userId } });
      await tx.themeOwnership.deleteMany({ where: { userId } });
      const chat = await tx.conversation.findUnique({ where: { userId }, select: { id: true } });
      if (chat) {
        await tx.directMessage.deleteMany({ where: { conversationId: chat.id } });
        await tx.conversation.delete({ where: { id: chat.id } });
      }
      if (children.length) {
        await tx.user.updateMany({
          where: { id: { in: children.map((c) => c.childId) } },
          data: { consent: "PENDING", consentDeadline: new Date(Date.now() + CONSENT_DAYS * 24 * 60 * 60_000) },
        });
      }
    },
    { timeout: 30_000 },
  );

  if (user.image) await deleteStoredUrls([user.image]);
  const files = await prisma.storedFile.findMany({ where: { ownerId: userId }, select: { id: true } });
  await deleteStoredUrls(files.map((f) => `/api/files/db/${f.id}`));
  await prisma.user.delete({ where: { id: userId } });
}
