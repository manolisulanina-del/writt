// Zod schemas shared by forms (client) and server actions (server).
import { z } from "zod";
import { isValidPhoneNumber, parsePhoneNumberWithError } from "libphonenumber-js/min";
import { checkPasswordStrength } from "@/lib/password-strength";
import { parseMusicUrl } from "@/lib/music";
import { MIN_SIGNUP_AGE, ageFrom } from "@/lib/content";

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "create",
  "edit",
  "fanfic",
  "forgot-password",
  "help",
  "login",
  "logout",
  "me",
  "moderator",
  "onboarding",
  "root",
  "settings",
  "signup",
  "support",
  "system",
  "u",
  "writt",
]);

/** Reserved for the admin account; actions reject it for anyone else (see adminOnlyUsernameError). */
export const ADMIN_USERNAME = "annamanoliadmin";

// Characters people swap in to imitate others ("annamanol1admin", "4nnamanoliadmin").
const LOOKALIKE: Record<string, string> = { "0": "o", "1": "i", l: "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g" };

/**
 * A username reduced to what it looks like: lowercase, accents and spaces and
 * punctuation removed, and look-alike characters folded together ("rn" → "m",
 * "1"/"l" → "i", "0" → "o", …).
 */
export function usernameSkeleton(name: string): string {
  const plain = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const folded = [...plain.replace(/rn/g, "m").replace(/vv/g, "w")].map((c) => LOOKALIKE[c] ?? c).join("");
  return folded.replace(/[^a-z0-9]/g, "");
}

/**
 * Error for a non-admin trying to take the admin's username, or anything that
 * looks like it ("AnnaManoliAdmin", "anna.manoli.admin", "annamanol1admin"),
 * else null. Checked on the server by every action that sets a username.
 */
export function adminOnlyUsernameError(username: string, userIsAdmin: boolean): string | null {
  if (userIsAdmin) return null;
  return usernameSkeleton(username).includes(usernameSkeleton(ADMIN_USERNAME)) ? "That username is reserved." : null;
}

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Usernames need at least 3 characters.")
  .max(20, "Usernames can be at most 20 characters.")
  .regex(/^[a-z0-9_.]+$/, "Use only letters, numbers, underscores and dots.")
  .refine((v) => !/^\.|\.$|\.\./.test(v), "Dots can’t start, end or repeat in a username.")
  .refine((v) => !v.startsWith("writer_"), "That prefix is reserved.")
  .refine((v) => !RESERVED_USERNAMES.has(v), "That username is reserved.");

export const emailSchema = z.email("Enter a valid email address.").trim().toLowerCase().max(254);

/** Adds a strength issue at `path` for each problem; `context` values (email, username) may not appear in it. */
export function refinePassword(
  ctx: z.RefinementCtx,
  password: string,
  context: string[],
  path: string,
) {
  if (password.length > 128) {
    ctx.addIssue({ code: "custom", message: "Passwords can be at most 128 characters.", path: [path] });
  }
  for (const message of checkPasswordStrength(password, context).problems) {
    ctx.addIssue({ code: "custom", message, path: [path] });
  }
}

export const phoneSchema = z
  .string()
  .trim()
  .max(32)
  .transform((v) => v.replace(/[\s().-]/g, ""))
  .refine((v) => v === "" || isValidPhoneNumber(v), {
    message: "Enter a valid phone number with country code, like +30 690 000 0000.",
  })
  .transform((v) => (v === "" ? null : parsePhoneNumberWithError(v).number.toString()));

/** A parent's email or phone number (with country code), for a child's sign-up. */
export const parentContactSchema = z
  .string()
  .trim()
  .min(1, "Enter your parent’s email or phone number.")
  .max(254)
  .transform((v, ctx): { method: "EMAIL" | "PHONE"; value: string } => {
    if (v.includes("@")) {
      const email = emailSchema.safeParse(v);
      if (email.success) return { method: "EMAIL", value: email.data };
    } else {
      const phone = phoneSchema.safeParse(v);
      if (phone.success && phone.data) return { method: "PHONE", value: phone.data };
    }
    ctx.addIssue({ code: "custom", message: "Enter a valid email, or a phone number with country code, like +1 202 555 0143." });
    return z.NEVER;
  });

export const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What was the title of the first book you loved?",
  "What is your favorite fictional character?",
  "What was the name of your childhood best friend?",
] as const;

export const securityQuestionSchema = z
  .string()
  .trim()
  .max(200, "Keep the question under 200 characters.");

export const securityAnswerSchema = z
  .string()
  .trim()
  .max(200, "Keep the answer under 200 characters.");

export const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth.")
  .transform((v) => new Date(`${v}T00:00:00Z`))
  .refine((d) => !Number.isNaN(d.getTime()), "Enter a valid date.")
  .refine((d) => d.getTime() <= Date.now(), "Your date of birth can’t be in the future.")
  .refine((d) => d.getUTCFullYear() >= new Date().getUTCFullYear() - 120, "Enter a valid date of birth.")
  .refine((d) => (ageFrom(d) ?? 0) >= MIN_SIGNUP_AGE, `Sorry, you need to be at least ${MIN_SIGNUP_AGE} to use Writt.`);

export const signupSchema = z
  .object({
    email: emailSchema,
    birthDate: birthDateSchema,
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    refinePassword(ctx, data.password, [data.email], "password");
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: "custom", message: "Passwords don’t match.", path: ["confirmPassword"] });
    }
  });

export const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1, "Enter your email or username.").max(254),
  password: z.string().min(1, "Enter your password.").max(128),
});

export const nicknameSchema = z
  .string()
  // Collapse whitespace and drop control characters so names render on one line.
  .transform((v) => v.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim())
  .pipe(z.string().max(40, "Keep your nickname under 40 characters."));

/** Date of birth from an <input type="date">: a real date, not in the future, at most 120 years ago. */
export const bioSchema = z.string().trim().max(500, "Keep your bio under 500 characters.");

export const musicUrlSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value, ctx) => {
    if (value === "") return null;
    const parsed = parseMusicUrl(value);
    if ("error" in parsed) {
      ctx.addIssue({ code: "custom", message: parsed.error });
      return z.NEVER;
    }
    return parsed.url;
  });

export const visibilitySchema = z.enum(["DRAFT", "PRIVATE", "PUBLIC"]);

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id.");

export const commentSchema = z.object({
  fanficId: objectIdSchema,
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(2000, "Comments can be at most 2,000 characters."),
});

export const REPORT_REASONS = [
  { value: "NUDITY", label: "Nudity" },
  { value: "VIOLENT_GRAPHIC", label: "Violently graphic content" },
  { value: "TERRORISM_HATE", label: "Terrorism or hate" },
  { value: "SEXUAL_ASSAULT_THREATS", label: "Sexual assault threats" },
  { value: "SELF_HARM", label: "Encouraging self-harm" },
  { value: "HARASSMENT_BULLYING", label: "Harassment or bullying" },
  { value: "SPAM_SCAM", label: "Spam or scam" },
  { value: "COPYRIGHT", label: "Copyright infringement" },
  { value: "WRONG_AGE_RANGE", label: "Wrong age range (not suitable for the ages it’s marked for)" },
  { value: "OTHER", label: "Other" },
] as const;

export type ReportReasonValue = (typeof REPORT_REASONS)[number]["value"];

export const reportSchema = z
  .object({
    fanficId: objectIdSchema,
    reason: z.enum(REPORT_REASONS.map((r) => r.value) as [ReportReasonValue, ...ReportReasonValue[]]),
    details: z.string().trim().max(1000, "Keep details under 1,000 characters.").default(""),
  })
  .refine((d) => d.reason !== "OTHER" || d.details.length > 0, {
    message: "Tell us what’s wrong.",
    path: ["details"],
  });

export type FieldErrors = Record<string, string[] | undefined>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}
