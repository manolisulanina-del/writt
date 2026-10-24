"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { unstable_update } from "@/auth";
import { prisma, isUniqueViolation } from "@/lib/db";
import { hashSecret, normalizeAnswer } from "@/lib/password";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";
import { isStorageUrl } from "@/lib/storage/types";
import { getKidState } from "@/lib/family";
import {
  adminOnlyUsernameError,
  bioSchema,
  fieldErrors,
  nicknameSchema,
  phoneSchema,
  securityAnswerSchema,
  securityQuestionSchema,
  usernameSchema,
} from "@/lib/validation";
import type { FormState } from "./auth";

export async function updateProfileAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { securityQuestion: true, image: true },
  });

  const raw = {
    username: String(formData.get("username") ?? ""),
    nickname: String(formData.get("nickname") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    image: String(formData.get("image") ?? ""),
    securityQuestion: String(formData.get("securityQuestion") ?? ""),
    securityAnswer: String(formData.get("securityAnswer") ?? ""),
  };
  const values = { username: raw.username, nickname: raw.nickname, bio: raw.bio, phone: raw.phone, image: raw.image, securityQuestion: raw.securityQuestion };

  const questionChanged = raw.securityQuestion.trim() !== (current.securityQuestion ?? "");
  const parsed = z
    .object({
      username: usernameSchema,
      nickname: nicknameSchema,
      bio: bioSchema,
      phone: phoneSchema,
      // Keep an OAuth avatar as is; new avatars must come from our storage.
      image: z.string().refine((v) => v === "" || v === current.image || isStorageUrl(v), "Upload the picture again."),
      securityQuestion: securityQuestionSchema,
      securityAnswer: securityAnswerSchema,
    })
    .superRefine((d, ctx) => {
      if (d.securityQuestion && questionChanged && !d.securityAnswer) {
        ctx.addIssue({ code: "custom", message: "Add an answer for your new question.", path: ["securityAnswer"] });
      }
    })
    .safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const d = parsed.data;
  // Kids: never a phone number; with a "simple profile", no nickname or bio either.
  const kid = await getKidState(user.id);
  const simple = Boolean(kid?.controls.limitedProfile);
  const reserved = adminOnlyUsernameError(d.username, isAdmin(user));
  if (reserved) return { fieldErrors: { username: [reserved] }, values };
  const security = !d.securityQuestion
    ? { securityQuestion: null, securityAnswerHash: null }
    : d.securityAnswer
      ? { securityQuestion: d.securityQuestion, securityAnswerHash: await hashSecret(normalizeAnswer(d.securityAnswer)) }
      : {}; // same question, answer left blank: keep the existing answer

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        username: d.username,
        nickname: simple ? null : d.nickname || null,
        bio: simple ? null : d.bio || null,
        phone: kid ? null : d.phone,
        image: d.image || null,
        ...security,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { fieldErrors: { username: ["That username is taken."] }, values };
    throw error;
  }

  await unstable_update({});
  redirect(`/u/${d.username}`);
}
