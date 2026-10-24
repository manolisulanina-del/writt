import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { ConsentState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { ageFrom } from "@/lib/content";
import { sendEmail } from "@/lib/email";
import { parentNoticeEmail } from "@/lib/email-templates";
import {
  CONSENT_DAYS,
  effectiveControls,
  kidGroupForAge,
  parseOverrides,
  type KidControls,
  type KidGroup,
} from "@/lib/kids";
import { notify, type NotificationKind } from "@/lib/notifications";

const DAY = 24 * 60 * 60_000;

/** What applies to a child (ages 7 to 15) right now. Null for everyone else. */
export type KidState = {
  group: KidGroup;
  age: number;
  controls: KidControls;
  /** Only the settings the parent changed by hand. */
  overrides: Partial<KidControls>;
  consent: ConsentState;
  paused: boolean;
  parentId: string | null;
};

/** A user's kid state, read from the database once per request. */
export const getKidState = cache(async (userId: string): Promise<KidState | null> => {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthDate: true, consent: true, kidControls: true, paused: true, familyParent: { select: { parentId: true } } },
  });
  if (!u) return null;
  const age = ageFrom(u.birthDate);
  const group = kidGroupForAge(age);
  if (!group || age === null) return null;
  const overrides = parseOverrides(u.kidControls);
  return {
    group,
    age,
    controls: effectiveControls(group, overrides),
    overrides,
    consent: u.consent,
    paused: u.paused,
    parentId: u.familyParent?.parentId ?? null,
  };
});

/** Ids of the children linked to this parent account. */
export const getChildIds = cache(async (parentId: string): Promise<string[]> => {
  const links = await prisma.familyLink.findMany({ where: { parentId }, select: { childId: true } });
  return links.map((l) => l.childId);
});

/**
 * The child, if `parentId` is their linked parent. Anyone else gets a 404, so
 * a parent can only ever see and manage their own children.
 */
export async function requireChildOf(parentId: string, childId: string) {
  const link = /^[a-f0-9]{24}$/i.test(childId) ? await prisma.familyLink.findUnique({ where: { childId }, select: { parentId: true } }) : null;
  if (!link || link.parentId !== parentId) notFound();
  return prisma.user.findUniqueOrThrow({
    where: { id: childId },
    select: { id: true, username: true, image: true, birthDate: true, consent: true, paused: true, kidControls: true, coins: true, createdAt: true },
  });
}

/** Tells a child's parent about something, in Writt and by email. */
export async function notifyParents(childId: string, n: { kind: NotificationKind; title: string; body: string }) {
  const link = await prisma.familyLink.findUnique({
    where: { childId },
    select: { parent: { select: { id: true, email: true } } },
  });
  if (!link) return;
  const href = `/family/${childId}`;
  await notify(link.parent.id, { ...n, link: href });
  if (link.parent.email) await sendEmail({ to: link.parent.email, ...parentNoticeEmail({ title: n.title, body: n.body, link: `${config.appUrl}${href}` }) });
}

type SyncUser = { id: string; username: string; birthDate: Date | null; consent: ConsentState; kidGroup: string | null };

/** Whether this user might need syncKidState (cheap check on fields already loaded). */
export function mayNeedKidSync(u: { birthDate: Date | null; consent: ConsentState; kidGroup: string | null }): boolean {
  if (u.consent !== "NOT_REQUIRED" || u.kidGroup) return true;
  const age = ageFrom(u.birthDate);
  return age !== null && age < 16;
}

/**
 * Applies age changes to a user's family state and returns the consent state
 * that now applies:
 * - under 16 without permission (e.g. an older account, or a corrected birth
 *   date): locked until a parent approves;
 * - turned 13: the parent is told, and untouched settings switch to the Older defaults;
 * - turned 16: restrictions end, the family link is removed, and both are told.
 */
export async function syncKidState(u: SyncUser): Promise<ConsentState> {
  const age = ageFrom(u.birthDate);
  const group = kidGroupForAge(age);

  if (!group) {
    if (u.consent === "NOT_REQUIRED" && !u.kidGroup) return u.consent;
    const link = await prisma.familyLink.findUnique({ where: { childId: u.id }, select: { parentId: true } });
    await prisma.$transaction([
      prisma.familyLink.deleteMany({ where: { childId: u.id } }),
      prisma.consentRequest.deleteMany({ where: { childId: u.id } }),
      prisma.user.update({
        where: { id: u.id },
        data: { consent: "NOT_REQUIRED", consentDeadline: null, kidGroup: null, kidControls: null, paused: false },
      }),
    ]);
    if (u.kidGroup && age !== null && age >= 16) {
      await notify(u.id, {
        kind: "FAMILY",
        title: "Happy 16th birthday!",
        body: "Your account no longer has any kids’ restrictions, and it’s no longer linked to a family account.",
      });
      if (link) {
        const parent = await prisma.user.findUnique({ where: { id: link.parentId }, select: { id: true, email: true } });
        const body = `${u.username} is now 16. Their account no longer has any restrictions, and it’s no longer linked to your family account.`;
        if (parent) {
          await notify(parent.id, { kind: "FAMILY", title: `${u.username} is now 16`, body, link: "/family" });
          if (parent.email) await sendEmail({ to: parent.email, ...parentNoticeEmail({ title: `${u.username} is now 16`, body, link: `${config.appUrl}/family` }) });
        }
      }
    }
    return "NOT_REQUIRED";
  }

  if (u.consent === "NOT_REQUIRED") {
    // Under 16 without a parent's permission: lock until one approves.
    await prisma.user.update({
      where: { id: u.id },
      data: { consent: "PENDING", consentDeadline: new Date(Date.now() + CONSENT_DAYS * DAY), kidGroup: group },
    });
    return "PENDING";
  }

  if (u.kidGroup !== group) {
    await prisma.user.update({ where: { id: u.id }, data: { kidGroup: group } });
    if (u.kidGroup === "YOUNGER" && group === "OLDER") {
      await notifyParents(u.id, {
        kind: "FAMILY",
        title: `${u.username} is now 13`,
        body: `${u.username} is now 13. Their account now uses the restrictions for ages 13 to 15. You can change them in your family dashboard.`,
      });
    }
  }
  return u.consent;
}

/**
 * Deletes kids' accounts nobody approved within 7 days, and applies birthdays
 * (turning 13 or 16) for every child. Run by /api/cron/family and, at most
 * every 10 minutes, after page loads.
 */
export async function runFamilyJobs(): Promise<{ deleted: number; synced: number }> {
  const { deleteUserCompletely } = await import("@/lib/accounts");
  const expired = await prisma.user.findMany({
    where: { consent: "PENDING", consentDeadline: { lt: new Date() } },
    select: { id: true },
    take: 200,
  });
  for (const u of expired) await deleteUserCompletely(u.id);

  const kids = await prisma.user.findMany({
    where: { OR: [{ consent: { not: "NOT_REQUIRED" } }, { kidGroup: { not: null } }] },
    select: { id: true, username: true, birthDate: true, consent: true, kidGroup: true },
    take: 5000,
  });
  let synced = 0;
  for (const k of kids) {
    const before = k.consent;
    if ((await syncKidState(k)) !== before || kidGroupForAge(ageFrom(k.birthDate)) !== k.kidGroup) synced++;
  }
  return { deleted: expired.length, synced };
}

let lastRun = 0;

/** runFamilyJobs at most once every 10 minutes per server instance. Call from after(). */
export async function maybeRunFamilyJobs() {
  if (Date.now() - lastRun < 10 * 60_000) return;
  lastRun = Date.now();
  try {
    await runFamilyJobs();
  } catch (error) {
    console.error("family jobs failed", error);
  }
}
