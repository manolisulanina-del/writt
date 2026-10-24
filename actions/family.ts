"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma, isObjectId } from "@/lib/db";
import { announceBook } from "@/lib/announce";
import { awardCoinsForBook } from "@/lib/coins";
import { consentRecordText } from "@/lib/consent-text";
import { getKidState, requireChildOf } from "@/lib/family";
import { isControlKey, withYoungerRestrictions, type KidControls } from "@/lib/kids";
import { notify } from "@/lib/notifications";
import { FEED_TAG } from "@/lib/queries";
import { requireParent } from "@/lib/session";

type Result = { ok: true } | { ok: false; error: string };

/** The signed-in parent and their child. Anyone else's child is a 404. */
async function parentOf(childId: string) {
  const parent = await requireParent();
  const child = await requireChildOf(parent.id, String(childId));
  return { parent, child };
}

const refresh = (childId: string) => {
  revalidatePath("/family");
  revalidatePath(`/family/${childId}`);
};

async function saveOverrides(childId: string, overrides: Partial<KidControls>) {
  await prisma.user.update({ where: { id: childId }, data: { kidControls: overrides as Prisma.InputJsonValue } });
}

/** Turns one restriction or switch on or off. It counts as the parent's choice from now on. */
export async function setControlAction(childId: string, key: string, value: boolean): Promise<Result> {
  const { child } = await parentOf(childId);
  if (!isControlKey(key) || typeof value !== "boolean") return { ok: false, error: "Unknown setting." };
  const state = await getKidState(child.id);
  if (!state) return { ok: false, error: "This account no longer has kids’ restrictions." };
  await saveOverrides(child.id, { ...state.overrides, [key]: value });
  // "No following" ends existing follows both ways, right away.
  if (key === "noFollow" && value) await prisma.follow.deleteMany({ where: { OR: [{ followerId: child.id }, { followingId: child.id }] } });
  refresh(child.id);
  updateTag(FEED_TAG);
  return { ok: true };
}

/** Turns on every restriction for ages 7 to 12 at once. */
export async function applyYoungerRestrictionsAction(childId: string): Promise<Result> {
  const { child } = await parentOf(childId);
  const state = await getKidState(child.id);
  if (!state) return { ok: false, error: "This account no longer has kids’ restrictions." };
  await saveOverrides(child.id, withYoungerRestrictions(state.overrides));
  await prisma.follow.deleteMany({ where: { OR: [{ followerId: child.id }, { followingId: child.id }] } });
  refresh(child.id);
  return { ok: true };
}

/** Forgets the parent's choices: every setting follows the age group's defaults again. */
export async function resetControlsAction(childId: string): Promise<Result> {
  const { child } = await parentOf(childId);
  await prisma.user.update({ where: { id: child.id }, data: { kidControls: {} } });
  refresh(child.id);
  return { ok: true };
}

export async function setPausedAction(childId: string, paused: boolean): Promise<Result> {
  const { child } = await parentOf(childId);
  await prisma.user.update({ where: { id: child.id }, data: { paused: Boolean(paused) } });
  if (paused) await notify(child.id, { kind: "FAMILY", title: "Your account is paused", body: "Your parent paused your Writt account." });
  refresh(child.id);
  return { ok: true };
}

/** Removes the parent's permission: the account is locked until they give it again. */
export async function revokeConsentAction(childId: string): Promise<Result> {
  const { child } = await parentOf(childId);
  await prisma.user.update({ where: { id: child.id }, data: { consent: "REVOKED" } });
  await prisma.consentRecord.updateMany({ where: { childId: child.id, revokedAt: null }, data: { revokedAt: new Date() } });
  refresh(child.id);
  return { ok: true };
}

/** Gives permission again (with the same agreement as the first time). */
export async function regrantConsentAction(childId: string, agreed: boolean): Promise<Result> {
  const { parent, child } = await parentOf(childId);
  if (agreed !== true) return { ok: false, error: "Tick the box to confirm you’re their parent or guardian." };
  const state = await getKidState(child.id);
  if (!state) return { ok: false, error: "This account no longer needs a parent’s permission." };
  const last = await prisma.consentRecord.findFirst({ where: { childId: child.id }, orderBy: { grantedAt: "desc" }, select: { method: true } });
  await prisma.$transaction([
    prisma.consentRecord.create({
      data: { parentId: parent.id, childId: child.id, method: last?.method ?? "EMAIL", text: consentRecordText(state.group, child.username), revokedAt: null },
    }),
    prisma.user.update({ where: { id: child.id }, data: { consent: "GRANTED", consentDeadline: null } }),
  ]);
  refresh(child.id);
  return { ok: true };
}

/** Deletes the child's account and everything in it, for good. */
export async function deleteChildAction(childId: string): Promise<Result> {
  const { child } = await parentOf(childId);
  const { deleteUserCompletely } = await import("@/lib/accounts");
  await deleteUserCompletely(child.id);
  updateTag(FEED_TAG);
  redirect("/family?deleted=1");
}

async function waitingBook(childId: string, fanficId: string) {
  if (!isObjectId(fanficId)) return null;
  return prisma.fanfic.findFirst({
    where: { id: fanficId, authorId: childId, awaitingApproval: true, removed: false },
    select: { id: true, title: true, publishedAt: true },
  });
}

/** Publishes a book the child asked to post. Coins for it are earned now. */
export async function approveBookAction(childId: string, fanficId: string): Promise<Result> {
  const { child } = await parentOf(childId);
  const book = await waitingBook(child.id, String(fanficId));
  if (!book) return { ok: false, error: "That book isn’t waiting for approval." };
  await prisma.fanfic.update({
    where: { id: book.id },
    data: { visibility: "PUBLIC", awaitingApproval: false, publishedAt: book.publishedAt ?? new Date() },
  });
  await announceBook(book.id);
  const coins = await awardCoinsForBook(book.id);
  await notify(child.id, {
    kind: "BOOK_APPROVAL",
    title: `“${book.title}” is published!`,
    body: `Your parent approved your book, so everyone can read it now.${coins ? ` You earned ${coins} coins.` : ""}`,
    link: `/fanfic/${book.id}`,
  });
  updateTag(FEED_TAG);
  refresh(child.id);
  return { ok: true };
}

/** Sends the book back: it stays private, and the child can edit it and ask again. */
export async function declineBookAction(childId: string, fanficId: string): Promise<Result> {
  const { child } = await parentOf(childId);
  const book = await waitingBook(child.id, String(fanficId));
  if (!book) return { ok: false, error: "That book isn’t waiting for approval." };
  await prisma.fanfic.update({ where: { id: book.id }, data: { awaitingApproval: false } });
  await notify(child.id, {
    kind: "BOOK_APPROVAL",
    title: `“${book.title}” wasn’t approved yet`,
    body: "Your parent didn’t approve this book for posting. It’s still saved as private, so you can change it and ask again.",
    link: `/fanfic/${book.id}`,
  });
  refresh(child.id);
  return { ok: true };
}
