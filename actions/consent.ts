"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { prisma, isUniqueViolation } from "@/lib/db";
import { approveConsent, declineConsent, findConsentRequest, sendConsentRequest, verifyConsentCode } from "@/lib/consent";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { smsAvailable } from "@/lib/sms";
import { familyLoginEmail } from "@/lib/email-templates";
import { createLoginToken } from "@/lib/login-tokens";
import { rateLimit, retryMessage, clientIp } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { emailSchema, fieldErrors, parentContactSchema } from "@/lib/validation";
import type { FormState } from "./auth";

/** A child waiting for approval: their account, if it's locked and waiting. */
async function waitingChild() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.consent !== "PENDING") redirect("/");
  return user;
}

/** Parents get at most 3 messages an hour, whether new or resent. */
const sendLimit = (childId: string) => rateLimit(`consent-send:${childId}`, 3, 60 * 60_000);

/** The child enters a parent's email or phone; Writt sends them the approval message. */
export async function requestParentConsentAction(_: FormState, formData: FormData): Promise<FormState> {
  const child = await waitingChild();
  const raw = String(formData.get("contact") ?? "");
  const parsed = z.object({ contact: parentContactSchema }).safeParse({ contact: raw });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: { contact: raw } };
  const contact = parsed.data.contact;
  if (contact.method === "PHONE" && !smsAvailable()) {
    return { fieldErrors: { contact: ["Writt can’t send text messages yet. Enter your parent’s email address instead."] }, values: { contact: raw } };
  }
  if (contact.method === "EMAIL" && contact.value === child.email) {
    return { fieldErrors: { contact: ["That’s your own email. Enter your parent’s email or phone number."] }, values: { contact: raw } };
  }
  const limit = await sendLimit(child.id);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds), values: { contact: raw } };

  await sendConsentRequest(child.id, contact);
  redirect("/family-consent?sent=1");
}

/** Sends the same parent a new message (max 3 an hour). */
export async function resendConsentAction(): Promise<{ ok: true } | { error: string }> {
  const child = await waitingChild();
  const request = await prisma.consentRequest.findUnique({ where: { childId: child.id }, select: { method: true, contact: true } });
  if (!request) return { error: "Enter your parent’s email or phone number first." };
  const limit = await sendLimit(child.id);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds).replace("Too many attempts.", "You can resend 3 times an hour.") };
  await sendConsentRequest(child.id, { method: request.method, value: request.contact });
  return { ok: true };
}

// ---- Parent side ----

/**
 * A parent without a Writt account makes a family account while approving.
 * If they use the same email the invite went to, the link already proves it's
 * theirs, so they're signed in straight away. Otherwise they get a sign-in link
 * by email first.
 */
export async function createFamilyAccountAction(token: string, _: FormState, formData: FormData): Promise<FormState> {
  const request = await findConsentRequest(String(token));
  if (!request) return { error: "This link has expired or was already used." };
  const raw = String(formData.get("email") ?? "");
  const parsed = z.object({ email: emailSchema }).safeParse({ email: raw });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: { email: raw } };
  const email = parsed.data.email;
  const limit = await rateLimit(`family-create:${await clientIp()}`, 10, 60 * 60_000);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds), values: { email: raw } };

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, kind: true } });
  if (existing && existing.kind !== "FAMILY") {
    return { error: "There’s already a Writt account with this email. Log in with it to approve.", values: { email: raw } };
  }
  let userId = existing?.id;
  if (!userId) {
    try {
      const created = await prisma.user.create({
        data: {
          email,
          kind: "FAMILY",
          username: `family_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
          needsSetup: false,
          hasSeenTutorial: true,
          hiddenWarnings: [],
        },
        select: { id: true },
      });
      userId = created.id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return { error: "Something went wrong. Try again.", values: { email: raw } };
    }
  }

  const loginToken = await createLoginToken(userId);
  const next = `/approve/${token}`;
  if (request.method === "EMAIL" && request.contact === email) {
    await signIn("family-link", { token: loginToken, redirectTo: next });
  }
  await sendEmail({ to: email, ...familyLoginEmail(`${config.appUrl}/family/login/verify?token=${loginToken}&next=${encodeURIComponent(next)}`) });
  return { values: { email: raw, sent: "1" } };
}

/** The parent approves (with the agreement ticked) or declines. */
export async function decideConsentAction(token: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/approve/${token}`);
  const decision = formData.get("decision");
  if (decision === "decline") {
    await declineConsent(String(token));
    redirect("/parents?declined=1");
  }
  if (formData.get("agree") !== "on") return { fieldErrors: { agree: ["Tick the box to confirm you’re their parent or guardian."] } };
  const result = await approveConsent(String(token), user.id);
  if ("error" in result) return { error: result.error };
  redirect(`/family/${result.childId}?approved=1`);
}

/** A parent who got a text enters the child's username and the 6-digit code. */
export async function enterConsentCodeAction(_: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!/^\d{6}$/.test(code.trim())) return { fieldErrors: { code: ["Enter the 6-digit code from the text."] }, values: { username, code } };
  const limit = await rateLimit(`consent-code:${await clientIp()}`, 20, 60 * 60_000);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds), values: { username, code } };
  const result = await verifyConsentCode(username, code);
  if ("error" in result) return { error: result.error, values: { username, code } };
  redirect(`/approve/${result.token}`);
}

/** Family accounts sign in with a link sent to their email (no password). */
export async function requestFamilyLoginAction(_: FormState, formData: FormData): Promise<FormState> {
  const raw = String(formData.get("email") ?? "");
  const parsed = z.object({ email: emailSchema }).safeParse({ email: raw });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: { email: raw } };
  const limit = await rateLimit(`family-login:${await clientIp()}`, 10, 60 * 60_000);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds), values: { email: raw } };
  const next = safeFamilyNext(String(formData.get("next") ?? ""));
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, kind: true } });
  if (user?.kind === "FAMILY") {
    const loginToken = await createLoginToken(user.id);
    await sendEmail({
      to: parsed.data.email,
      ...familyLoginEmail(`${config.appUrl}/family/login/verify?token=${loginToken}&next=${encodeURIComponent(next)}`),
    });
  }
  // The same answer either way, so this can't be used to check who has an account.
  return { values: { email: raw, sent: "1" } };
}

/** Only the family dashboard or an approval page may follow a family sign-in. */
function safeFamilyNext(next: string): string {
  return /^\/(family(\/[a-f0-9]{24})?|approve\/[A-Za-z0-9_-]+)$/.test(next) ? next : "/family";
}

/** Second step of a sign-in link: a button press (not the email click itself), so link scanners can't use it up. */
export async function signInWithFamilyLinkAction(token: string, next: string) {
  const safeNext = safeFamilyNext(String(next));
  try {
    await signIn("family-link", { token: String(token), redirectTo: safeNext });
  } catch (error) {
    unstable_rethrow(error); // the successful sign-in's redirect
    redirect("/family/login?expired=1");
  }
}
