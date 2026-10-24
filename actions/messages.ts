"use server";

import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/auth/admin";
import { MESSAGE_MAX, preview } from "@/lib/messages";
import { notify } from "@/lib/notifications";
import { rateLimit, retryMessage } from "@/lib/rate-limit";
import { requireParent } from "@/lib/session";

type Result = { ok: true } | { error: string };

/**
 * Sends a message in a "Message admin" chat. Everyone else always writes to
 * the admin, whatever they send; only the admin picks who to write to (`to`).
 */
export async function sendMessageAction(body: string, to?: string): Promise<Result> {
  const user = await requireParent();
  const text = String(body ?? "").trim();
  if (!text) return { error: "Write a message first." };
  if (text.length > MESSAGE_MAX) return { error: `Messages can be at most ${MESSAGE_MAX.toLocaleString()} characters.` };
  const limit = await rateLimit(`dm:${user.id}`, 20, 10 * 60_000);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds).replace("Too many attempts", "You’re sending messages very fast") };

  const admin = isAdmin(user);
  let userId = user.id;
  if (admin) {
    const target = to
      ? await prisma.user.findUnique({ where: { username: String(to).toLowerCase().replace(/^@/, "") }, select: { id: true, role: true, email: true } })
      : null;
    if (!target || isAdmin(target)) return { error: "That user doesn’t exist." };
    userId = target.id;
  }

  const conversation = await prisma.conversation.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true, unreadByUser: true },
  });
  await prisma.$transaction([
    prisma.directMessage.create({ data: { conversationId: conversation.id, fromAdmin: admin, body: text } }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastPreview: `${admin ? "You: " : ""}${preview(text)}`,
        ...(admin ? { unreadByUser: { increment: 1 } } : { unreadByAdmin: { increment: 1 } }),
      },
    }),
  ]);
  // One notification per batch of unread replies, not one per message.
  if (admin && conversation.unreadByUser === 0) {
    await notify(userId, { kind: "MESSAGE", title: "New message from the creator of Writt", body: preview(text), link: "/messages" });
  }
  return { ok: true };
}

/** Marks a chat as read: the user's own, or (for the admin) the chat with `username`. */
export async function markChatReadAction(username?: string): Promise<void> {
  const user = await requireParent();
  if (isAdmin(user)) {
    const target = username ? await prisma.user.findUnique({ where: { username: String(username).toLowerCase() }, select: { id: true } }) : null;
    if (target) await prisma.conversation.updateMany({ where: { userId: target.id }, data: { unreadByAdmin: 0 } });
    return;
  }
  await prisma.conversation.updateMany({ where: { userId: user.id }, data: { unreadByUser: 0 } });
  await prisma.notification.updateMany({ where: { userId: user.id, kind: "MESSAGE", read: false }, data: { read: true } });
}
