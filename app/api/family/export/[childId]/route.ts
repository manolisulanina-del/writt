import { NextResponse } from "next/server";
import { prisma, isObjectId } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/** Everything Writt stores about a child, as a JSON download. Only their linked parent may get it. */
export async function GET(_request: Request, ctx: RouteContext<"/api/family/export/[childId]">) {
  const { childId } = await ctx.params;
  const parent = await getCurrentUser();
  const link = parent && isObjectId(childId) ? await prisma.familyLink.findUnique({ where: { childId }, select: { parentId: true } }) : null;
  if (!parent || !link || link.parentId !== parent.id) return new NextResponse("Not found", { status: 404 });

  const [account, books, comments, reactions, library, follows, coins, themes, notifications, consents, messages] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: childId },
      select: {
        username: true,
        nickname: true,
        email: true,
        image: true,
        bio: true,
        birthDate: true,
        createdAt: true,
        coins: true,
        homeTheme: true,
        consent: true,
        paused: true,
        kidControls: true,
        readerPrefs: true,
      },
    }),
    prisma.fanfic.findMany({
      where: { authorId: childId },
      select: {
        title: true,
        summary: true,
        visibility: true,
        rating: true,
        warnings: true,
        status: true,
        removed: true,
        removedReason: true,
        createdAt: true,
        updatedAt: true,
        chapters: { orderBy: { order: "asc" }, select: { title: true, noteStart: true, noteEnd: true, publishAt: true, pages: { orderBy: { order: "asc" }, select: { content: true } } } },
      },
    }),
    prisma.comment.findMany({ where: { authorId: childId }, select: { body: true, createdAt: true, fanfic: { select: { title: true } } } }),
    prisma.reaction.findMany({ where: { userId: childId }, select: { type: true, createdAt: true, fanfic: { select: { title: true } } } }),
    prisma.libraryEntry.findMany({ where: { userId: childId }, select: { createdAt: true, fanfic: { select: { title: true } } } }),
    prisma.follow.findMany({ where: { OR: [{ followerId: childId }, { followingId: childId }] }, select: { createdAt: true, follower: { select: { username: true } }, following: { select: { username: true } } } }),
    prisma.coinTransaction.findMany({ where: { userId: childId }, orderBy: { createdAt: "asc" }, select: { amount: true, reason: true, note: true, theme: true, createdAt: true } }),
    prisma.themeOwnership.findMany({ where: { userId: childId }, select: { theme: true, source: true, createdAt: true } }),
    prisma.notification.findMany({ where: { userId: childId }, select: { kind: true, title: true, body: true, createdAt: true } }),
    prisma.consentRecord.findMany({ where: { childId }, select: { method: true, text: true, grantedAt: true, revokedAt: true } }),
    prisma.directMessage.findMany({ where: { conversation: { userId: childId } }, orderBy: { createdAt: "asc" }, select: { fromAdmin: true, body: true, createdAt: true } }),
  ]);

  const data = { exportedAt: new Date().toISOString(), account, books, comments, reactions, library, follows, coins, themes, notifications, consents, messagesWithAdmin: messages };
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="writt-${account.username}.json"`,
      "cache-control": "no-store",
    },
  });
}
