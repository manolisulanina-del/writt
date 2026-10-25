"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { placeholderUsername, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { oauthProviders, type OAuthProviderId } from "@/lib/config";
import { isAdmin, roleForNewAccount } from "@/lib/auth/admin-identity";
import { consentFieldsFor } from "@/lib/kids";
import { getCurrentUser, landingPath } from "@/lib/session";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import { consumeLoginToken, createLoginToken, peekLoginToken, revokeLoginTokens } from "@/lib/login-tokens";
import { hashSecret, normalizeAnswer, verifySecret } from "@/lib/password";
import { clientIp, rateLimit, retryMessage } from "@/lib/rate-limit";
import {
  fieldErrors,
  loginSchema,
  refinePassword,
  signupSchema,
  type FieldErrors,
} from "@/lib/validation";

export type FormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
};

/** Only same-site relative paths are allowed as post-login destinations. */
function safeCallback(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

/**
 * Where to go after signing in. Sends unfinished accounts straight to the step
 * they still need, so the browser's address matches the page it shows.
 */
async function afterLoginPath(identifier: string, callback: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: identifier.includes("@") ? { email: identifier } : { username: identifier },
    select: { kind: true, needsSetup: true, birthDate: true, consent: true, paused: true },
  });
  return user ? landingPath(user, callback) : callback;
}

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const values = { identifier: String(formData.get("identifier") ?? "") };
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  try {
    await signIn("credentials", {
      ...parsed.data,
      redirectTo: await afterLoginPath(parsed.data.identifier, safeCallback(formData.get("callbackUrl"))),
    });
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === "banned") {
      return { error: "This account is banned. You can log in again when the ban ends.", values };
    }
    if (error instanceof CredentialsSignin && error.code === "rate_limited") {
      return { error: "Too many sign-in attempts. Wait 15 minutes and try again.", values };
    }
    if (error instanceof AuthError) {
      return { error: "That email or username and password don’t match.", values };
    }
    throw error; // the success redirect
  }
  return {};
}

export async function signupAction(_: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? ""), birthDate: String(formData.get("birthDate") ?? "") };
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    birthDate: values.birthDate,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const limit = await rateLimit(`signup:${await clientIp()}`, 5, 60 * 60_000);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds), values };

  const { email, password, birthDate } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return {
      fieldErrors: {
        email: ["An account with this email already exists. Log in instead, or use the sign-in method you chose before."],
      },
      values,
    };
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashSecret(password),
      birthDate,
      // Ages 7 to 15: the account is locked until a parent approves (after onboarding).
      ...consentFieldsFor(birthDate),
      username: placeholderUsername(),
      role: roleForNewAccount(email),
    },
  });

  await signIn("credentials", { identifier: email, password, redirectTo: "/onboarding" });
  return {};
}

export async function oauthSignInAction(formData: FormData) {
  const provider = String(formData.get("provider")) as OAuthProviderId;
  if (!oauthProviders[provider]) redirect("/login?error=Configuration");
  await signIn(provider, { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/** Signs this account out on every device (each one notices within a minute), then here. */
export async function signOutEverywhereAction() {
  const user = await getCurrentUser();
  if (user) await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
  await signOut({ redirectTo: "/login" });
}

// ---- Forgot password (security question) ----

export type RecoveryState = FormState & {
  step: "identify" | "answer" | "done";
  identifier?: string;
  question?: string;
};

const identifierSchema = z.string().trim().toLowerCase().min(1, "Enter your email or username.").max(254);

function findByIdentifier(identifier: string) {
  return prisma.user.findFirst({
    where: identifier.includes("@") ? { email: identifier } : { username: identifier },
    select: { id: true, email: true, username: true, role: true, securityQuestion: true, securityAnswerHash: true },
  });
}

/**
 * The admin account can't be recovered with a security question: answers can
 * be guessed or looked up. It resets only through a link sent to its email.
 */
const ADMIN_RECOVERY = "This account can only be reset with “Email me a reset link”.";

export async function recoveryAction(state: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const limit = await rateLimit(`recover-ip:${await clientIp()}`, 20, 15 * 60_000);
  if (!limit.ok) return { ...state, error: retryMessage(limit.retryAfterSeconds) };

  const parsedId = identifierSchema.safeParse(formData.get("identifier"));
  if (!parsedId.success) {
    return { step: "identify", fieldErrors: { identifier: [parsedId.error.issues[0].message] } };
  }
  const identifier = parsedId.data;
  const user = await findByIdentifier(identifier);

  if (state.step === "identify") {
    if (user && isAdmin(user)) return { step: "identify", values: { identifier }, error: ADMIN_RECOVERY };
    if (!user?.securityQuestion || !user.securityAnswerHash) {
      return {
        step: "identify",
        values: { identifier },
        error:
          "This account has no security question. Use “Email me a reset link” instead, or sign in with Google, Facebook or Apple if you used one.",
      };
    }
    return { step: "answer", identifier, question: user.securityQuestion };
  }

  // Step 2: check the answer and set a new password.
  if (user && isAdmin(user)) return { step: "identify", values: { identifier }, error: ADMIN_RECOVERY };
  if (!user?.securityQuestion || !user.securityAnswerHash) return { step: "identify" };
  const answerLimit = await rateLimit(`recover:${user.id}`, 5, 30 * 60_000);
  const base = { step: "answer" as const, identifier, question: user.securityQuestion };
  if (!answerLimit.ok) return { ...base, error: retryMessage(answerLimit.retryAfterSeconds) };

  const parsed = z
    .object({ answer: z.string().trim().min(1, "Enter your answer."), password: z.string(), confirmPassword: z.string() })
    .superRefine((d, ctx) => {
      refinePassword(ctx, d.password, [user.email ?? "", user.username], "password");
      if (d.password !== d.confirmPassword) {
        ctx.addIssue({ code: "custom", message: "Passwords don’t match.", path: ["confirmPassword"] });
      }
    })
    .safeParse({
      answer: formData.get("answer"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });
  if (!parsed.success) return { ...base, fieldErrors: fieldErrors(parsed.error) };

  if (!(await verifySecret(normalizeAnswer(parsed.data.answer), user.securityAnswerHash))) {
    return { ...base, fieldErrors: { answer: ["That answer doesn’t match."] } };
  }

  // A new password signs out every device that was logged in.
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashSecret(parsed.data.password), sessionVersion: { increment: 1 } },
  });
  return { step: "done" };
}

// ---- Forgot password (email link) ----

/**
 * Emails a one-time link to choose a new password. The answer is the same
 * whether or not the account exists, so this can't be used to find out who
 * has an account.
 */
export async function requestPasswordResetAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsedId = identifierSchema.safeParse(formData.get("identifier"));
  if (!parsedId.success) return { fieldErrors: { identifier: [parsedId.error.issues[0].message] } };
  const identifier = parsedId.data;
  const limit = await rateLimit(`reset-ip:${await clientIp()}`, 10, 60 * 60_000);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds), values: { identifier } };

  const user = await prisma.user.findFirst({
    where: identifier.includes("@") ? { email: identifier } : { username: identifier },
    select: { id: true, email: true, kind: true },
  });
  // Family accounts have no password; they sign in with a link from /family/login.
  if (user?.email && user.kind !== "FAMILY" && (await rateLimit(`reset:${user.id}`, 3, 60 * 60_000)).ok) {
    const token = await createLoginToken(user.id, 60, "PASSWORD_RESET");
    await sendEmail({ to: user.email, ...passwordResetEmail(`${config.appUrl}/reset-password?token=${token}`) });
  }
  return { values: { identifier, sent: "1" } };
}

/** Sets a new password from an emailed link. The link works once. */
export async function resetPasswordAction(token: string, _: FormState, formData: FormData): Promise<FormState> {
  const userId = await peekLoginToken(String(token), "PASSWORD_RESET");
  if (!userId) return { error: "This link has expired or was already used. Ask for a new one." };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, username: true } });
  const parsed = z
    .object({ password: z.string(), confirmPassword: z.string() })
    .superRefine((d, ctx) => {
      refinePassword(ctx, d.password, [user.email ?? "", user.username], "password");
      if (d.password !== d.confirmPassword) ctx.addIssue({ code: "custom", message: "Passwords don’t match.", path: ["confirmPassword"] });
    })
    .safeParse({ password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  // Use the link up first, so it can't be used twice at the same moment.
  if ((await consumeLoginToken(String(token), "PASSWORD_RESET")) !== userId) {
    return { error: "This link has expired or was already used. Ask for a new one." };
  }
  // A new password signs out every device that was logged in.
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashSecret(parsed.data.password), sessionVersion: { increment: 1 } } });
  await revokeLoginTokens(userId, "PASSWORD_RESET");
  // Clear failed-login lockouts so the new password works right away.
  await prisma.rateLimit.deleteMany({ where: { key: { in: [`login:${user.username}`, `login:${user.email ?? ""}`] } } });
  return { values: { done: "1" } };
}
