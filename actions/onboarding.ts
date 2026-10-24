"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { unstable_update } from "@/auth";
import { prisma, isUniqueViolation } from "@/lib/db";
import { consentFieldsFor, needsConsent } from "@/lib/kids";
import { hashSecret, normalizeAnswer } from "@/lib/password";
import { getCurrentUser, landingPath } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";
import {
  adminOnlyUsernameError,
  birthDateSchema,
  fieldErrors,
  phoneSchema,
  refinePassword,
  securityAnswerSchema,
  securityQuestionSchema,
  usernameSchema,
} from "@/lib/validation";
import type { FormState } from "./auth";

const LANDING = { kind: true, needsSetup: true, birthDate: true, consent: true, paused: true } as const;

export async function completeSetupAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.needsSetup) redirect("/");

  const { passwordHash } = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const needsPassword = !passwordHash;
  // Email sign-ups already gave it; it's set once and never changed by the user.
  const needsBirthDate = !user.birthDate;

  const raw = {
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
    securityQuestion: String(formData.get("securityQuestion") ?? ""),
    securityAnswer: String(formData.get("securityAnswer") ?? ""),
  };
  const values = { username: raw.username, phone: raw.phone, birthDate: raw.birthDate, securityQuestion: raw.securityQuestion };

  const parsed = z
    .object({
      username: usernameSchema,
      password: z.string(),
      confirmPassword: z.string(),
      phone: phoneSchema,
      birthDate: needsBirthDate ? birthDateSchema : z.unknown(),
      securityQuestion: securityQuestionSchema,
      securityAnswer: securityAnswerSchema,
    })
    .superRefine((d, ctx) => {
      if (needsPassword) {
        refinePassword(ctx, d.password, [d.username, user.email ?? ""], "password");
        if (d.password !== d.confirmPassword) {
          ctx.addIssue({ code: "custom", message: "Passwords don’t match.", path: ["confirmPassword"] });
        }
      }
      if (d.securityQuestion && !d.securityAnswer) {
        ctx.addIssue({ code: "custom", message: "Add an answer, or clear the question.", path: ["securityAnswer"] });
      }
      if (!d.securityQuestion && d.securityAnswer) {
        ctx.addIssue({ code: "custom", message: "Pick a question for this answer.", path: ["securityQuestion"] });
      }
    })
    .safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const d = parsed.data;
  const birthDate = needsBirthDate ? (d.birthDate as Date) : user.birthDate!;
  // Kids (under 16) have no phone number on their account.
  const kid = needsConsent(birthDate);
  const reserved = adminOnlyUsernameError(d.username, isAdmin(user));
  if (reserved) return { fieldErrors: { username: [reserved] }, values };
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        username: d.username,
        name: user.name ?? d.username,
        phone: kid ? null : d.phone,
        ...(needsBirthDate ? { birthDate, ...consentFieldsFor(birthDate) } : {}),
        needsSetup: false,
        ...(needsPassword ? { passwordHash: await hashSecret(d.password) } : {}),
        ...(d.securityQuestion
          ? {
              securityQuestion: d.securityQuestion,
              securityAnswerHash: await hashSecret(normalizeAnswer(d.securityAnswer)),
            }
          : {}),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { fieldErrors: { username: ["That username is taken. Try another."] }, values };
    }
    throw error;
  }

  // Re-issue the session token so the proxy stops redirecting to onboarding.
  await unstable_update({});
  redirect(landingPath(await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: LANDING })));
}

/** For accounts made before a date of birth was required. It can only be set once. */
export async function confirmBirthDateAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.birthDate) redirect("/");
  const raw = String(formData.get("birthDate") ?? "");
  const parsed = z.object({ birthDate: birthDateSchema }).safeParse({ birthDate: raw });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: { birthDate: raw } };

  await prisma.user.update({ where: { id: user.id }, data: { birthDate: parsed.data.birthDate, ...consentFieldsFor(parsed.data.birthDate) } });
  // Re-issue the session token so the proxy stops redirecting here.
  await unstable_update({});
  redirect(landingPath(await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: LANDING })));
}

export async function markTutorialSeenAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { hasSeenTutorial: true } });
}

export async function checkUsernameAction(username: string): Promise<{ ok: boolean; message?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const reserved = adminOnlyUsernameError(parsed.data, isAdmin(user));
  if (reserved) return { ok: false, message: reserved };
  const taken = await prisma.user.findFirst({
    where: { username: parsed.data, NOT: { id: user.id } },
    select: { id: true },
  });
  return taken ? { ok: false, message: "That username is taken." } : { ok: true };
}
