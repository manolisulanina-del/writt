import "server-only";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";

// In-site notifications only (the navbar bell). Nothing here is ever sent by
// email, SMS or any outside service.

export type NotificationKind =
  | "BOOK_REMOVED"
  | "BOOK_RESTORED"
  | "BANNED"
  | "BLOCKED"
  | "MUTED"
  | "WARNING"
  | "RENAMED"
  | "RATING_CHANGED"
  | "BIRTHDATE_CHANGED"
  | "APPEAL_NEW"
  | "APPEAL_REPLY"
  | "APPEAL_APPROVED"
  | "APPEAL_DENIED"
  | "NEW_BOOK"
  | "NEW_CHAPTER"
  // Family accounts: approvals, restrictions, birthdays, notices about a child.
  | "FAMILY"
  | "BOOK_APPROVAL"
  | "COINS"
  // A reply in "Message admin".
  | "MESSAGE";

export async function notify(
  userId: string,
  n: { kind: NotificationKind; title: string; body: string; link?: string | null },
) {
  await prisma.notification.create({ data: { userId, kind: n.kind, title: n.title, body: n.body, link: n.link ?? null } });
}

/** The admin's user id, found by ADMIN_EMAIL. Null if the admin hasn't signed up. */
export async function getAdminId(): Promise<string | null> {
  if (!config.adminEmail) return null;
  const admin = await prisma.user.findUnique({ where: { email: config.adminEmail }, select: { id: true } });
  return admin?.id ?? null;
}

export async function notifyAdmin(n: { kind: NotificationKind; title: string; body: string; link?: string | null }) {
  const adminId = await getAdminId();
  if (adminId) await notify(adminId, n);
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}

/** "29 Oct 2026, 14:00 UTC", or "forever" for permanent bans. */
export function untilText(date: Date): string {
  if (date.getUTCFullYear() >= 9999) return "forever";
  return `until ${date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
}
