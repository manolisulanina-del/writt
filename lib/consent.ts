import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { ContactMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { ageFrom } from "@/lib/content";
import { consentRecordText } from "@/lib/consent-text";
import { sendEmail } from "@/lib/email";
import { consentEmail, consentSms } from "@/lib/email-templates";
import { CONSENT_DAYS, kidGroupFor } from "@/lib/kids";
import { notify } from "@/lib/notifications";
import { sendSms } from "@/lib/sms";

const DAY = 24 * 60 * 60_000;

export const hashSecret = (raw: string) => createHash("sha256").update(raw).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export type Contact = { method: ContactMethod; value: string };

/**
 * Creates (or replaces) the child's parent invite and sends it: an email with a
 * link, or a text with a 6-digit code and a link. A new link and code are made
 * every time, so only the latest message works.
 */
export async function sendConsentRequest(childId: string, contact: Contact): Promise<boolean> {
  const child = await prisma.user.findUniqueOrThrow({
    where: { id: childId },
    select: { username: true, birthDate: true, consentDeadline: true },
  });
  const group = kidGroupFor(child.birthDate);
  if (!group) return false;
  const deadline = child.consentDeadline ?? new Date(Date.now() + CONSENT_DAYS * DAY);
  const token = newToken();
  const code = contact.method === "PHONE" ? newCode() : null;
  const data = {
    method: contact.method,
    contact: contact.value,
    tokenHash: hashSecret(token),
    codeHash: code ? hashSecret(code) : null,
    attempts: 0,
    expiresAt: deadline,
    sentAt: new Date(),
  };
  await prisma.$transaction([
    prisma.consentRequest.upsert({ where: { childId }, create: { childId, ...data }, update: data }),
    prisma.user.update({ where: { id: childId }, data: { consentDeadline: deadline } }),
  ]);

  const daysLeft = Math.max(1, Math.ceil((deadline.getTime() - Date.now()) / DAY));
  const faqUrl = `${config.appUrl}/parents`;
  if (contact.method === "EMAIL") {
    return sendEmail({ to: contact.value, ...consentEmail(group, { username: child.username, approveUrl: `${config.appUrl}/approve/${token}`, faqUrl, daysLeft }) });
  }
  return sendSms(contact.value, consentSms(group, { username: child.username, code: code!, link: `${config.appUrl}/a/${token}`, faqUrl, daysLeft }));
}

/** The pending invite for a link token, if it's still valid. */
export async function findConsentRequest(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const request = await prisma.consentRequest.findUnique({
    where: { tokenHash: hashSecret(token) },
    select: {
      id: true,
      childId: true,
      method: true,
      contact: true,
      expiresAt: true,
      child: { select: { id: true, username: true, birthDate: true, consent: true, image: true } },
    },
  });
  if (!request || request.expiresAt.getTime() < Date.now() || request.child.consent !== "PENDING") return null;
  const group = kidGroupFor(request.child.birthDate);
  return group ? { ...request, group } : null;
}

const MAX_CODE_ATTEMPTS = 5;

/**
 * Checks a texted code for a child's username. On success the invite gets a
 * fresh link token (returned), so the parent continues on the normal approval page.
 */
export async function verifyConsentCode(username: string, code: string): Promise<{ token: string } | { error: string }> {
  const child = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase().replace(/^@/, "") }, select: { id: true } });
  const request = child ? await prisma.consentRequest.findUnique({ where: { childId: child.id } }) : null;
  const wrong = { error: "That code doesn’t match. Check the username and the 6-digit code in the text." };
  if (!request?.codeHash || request.expiresAt.getTime() < Date.now()) return wrong;
  if (request.attempts >= MAX_CODE_ATTEMPTS) return { error: "Too many wrong codes. Ask your child to press Resend for a new code." };
  const a = Buffer.from(hashSecret(code.trim()));
  const b = Buffer.from(request.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await prisma.consentRequest.update({ where: { id: request.id }, data: { attempts: { increment: 1 } } });
    return wrong;
  }
  const token = newToken();
  await prisma.consentRequest.update({ where: { id: request.id }, data: { tokenHash: hashSecret(token), codeHash: null } });
  return { token };
}

/** Whether this account may approve a child: a family account, or a writer aged 18 or over. */
export function canActAsParent(parent: { kind: string; birthDate: Date | null }): boolean {
  if (parent.kind === "FAMILY") return true;
  const age = ageFrom(parent.birthDate);
  return age !== null && age >= 18;
}

/** Links the parent and child, records the consent, and unlocks the child's account. */
export async function approveConsent(token: string, parentId: string): Promise<{ childId: string } | { error: string }> {
  const request = await findConsentRequest(token);
  if (!request) return { error: "This link has expired or was already used." };
  if (request.childId === parentId) return { error: "You can’t approve your own account." };
  const parent = await prisma.user.findUniqueOrThrow({ where: { id: parentId }, select: { kind: true, birthDate: true } });
  if (!canActAsParent(parent)) return { error: "Only a parent or guardian aged 18 or over can approve." };

  await prisma.$transaction([
    prisma.familyLink.upsert({
      where: { childId: request.childId },
      create: { parentId, childId: request.childId },
      update: { parentId },
    }),
    prisma.consentRecord.create({
      data: { parentId, childId: request.childId, method: request.method, text: consentRecordText(request.group, request.child.username), revokedAt: null },
    }),
    prisma.user.update({
      where: { id: request.childId },
      data: { consent: "GRANTED", consentDeadline: null, kidGroup: request.group, paused: false },
    }),
    prisma.consentRequest.delete({ where: { id: request.id } }),
  ]);
  await notify(request.childId, {
    kind: "FAMILY",
    title: "Your parent approved your account!",
    body: "Welcome to Writt. Have fun writing and reading!",
    link: "/",
  });
  return { childId: request.childId };
}

/** The parent said no: the child's account and everything in it is deleted. */
export async function declineConsent(token: string): Promise<boolean> {
  const request = await findConsentRequest(token);
  if (!request) return false;
  const { deleteUserCompletely } = await import("@/lib/accounts");
  await deleteUserCompletely(request.childId);
  return true;
}
