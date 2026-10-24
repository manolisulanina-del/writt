"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/** Marks the signed-in user's notifications as read (when they open the list). */
export async function markNotificationsReadAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
}

/** "I understand" on the warning popup. */
export async function acknowledgeWarningsAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.notification.updateMany({ where: { userId: user.id, kind: "WARNING", read: false }, data: { read: true } });
}
