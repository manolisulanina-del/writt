import "server-only";
import { prisma } from "@/lib/db";

// "Message admin": each user has one private chat with the admin. The admin
// sees every chat in an inbox. See actions/messages.ts for sending.

export const MESSAGE_MAX = 2000;

export type ChatMessage = { id: string; fromAdmin: boolean; body: string; at: string };

const toChat = (m: { id: string; fromAdmin: boolean; body: string; createdAt: Date }): ChatMessage => ({
  id: m.id,
  fromAdmin: m.fromAdmin,
  body: m.body,
  at: m.createdAt.toISOString(),
});

/** A user's chat with the admin, oldest message first (the latest 300). */
export async function getThread(userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { userId },
    select: {
      unreadByAdmin: true,
      unreadByUser: true,
      messages: { orderBy: { createdAt: "desc" }, take: 300, select: { id: true, fromAdmin: true, body: true, createdAt: true } },
    },
  });
  return {
    messages: (conversation?.messages ?? []).reverse().map(toChat),
    unreadByAdmin: conversation?.unreadByAdmin ?? 0,
    unreadByUser: conversation?.unreadByUser ?? 0,
  };
}

/** The admin's inbox: every chat, most recent first. */
export async function getInbox() {
  const rows = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 300,
    select: {
      lastMessageAt: true,
      lastPreview: true,
      unreadByAdmin: true,
      user: { select: { username: true, nickname: true, image: true } },
    },
  });
  return rows.map((r) => ({ ...r, lastMessageAt: r.lastMessageAt.toISOString() }));
}

/** How many chats have messages the admin hasn't read (the navbar badge). */
export async function adminUnreadChats(): Promise<number> {
  return prisma.conversation.count({ where: { unreadByAdmin: { gt: 0 } } });
}

/** A short one-line preview for the inbox. */
export function preview(body: string): string {
  const line = body.replace(/\s+/g, " ").trim();
  return line.length > 90 ? `${line.slice(0, 89)}…` : line;
}
