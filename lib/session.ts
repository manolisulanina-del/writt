import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth, isBanned } from "@/auth";
import { isAdmin } from "@/lib/auth/admin-identity";
import { prisma } from "@/lib/db";
import { mayNeedKidSync, syncKidState } from "@/lib/family";
import { needsConsent } from "@/lib/kids";
import { getSiteSettings } from "@/lib/settings";

// Data Access Layer: every page and action reads the user through here, so
// authorization always comes from the database, not the client.

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

function loadUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      image: true,
      role: true,
      needsSetup: true,
      birthDate: true,
      hasSeenTutorial: true,
      bannedUntil: true,
      mutedUntil: true,
      kind: true,
      consent: true,
      kidGroup: true,
      paused: true,
      coins: true,
      homeTheme: true,
    },
  });
}

/** The signed-in user, or null. Deduplicated per request. */
export const getCurrentUser = cache(async () => {
  // Auth.js reads the clock before the cookie; mark this as request-time work
  // so Cache Components doesn't try to run it while prerendering.
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  return id ? loadUser(id) : null;
});

/**
 * The signed-in user with a finished profile; redirects otherwise. Every page
 * and action goes through here, so bans and maintenance mode are enforced on
 * the server, not just hidden in the interface.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Family accounts (parents only) have just the family dashboard.
  if (user.kind === "FAMILY") redirect("/family");
  // A date of birth is required of everyone, the admin included (onboarding asks new accounts).
  if (!user.needsSetup && !user.birthDate) redirect("/confirm-age");
  if (isAdmin(user)) return user;
  if (isBanned(user)) redirect("/banned");
  if ((await getSiteSettings()).maintenance) redirect("/maintenance");
  if (user.needsSetup) redirect("/onboarding");
  // Kids (7 to 15): locked until a parent approves, and while a parent has paused them.
  const consent = mayNeedKidSync(user) ? await syncKidState(user) : user.consent;
  if (consent === "PENDING" || consent === "REVOKED") redirect("/family-consent");
  if (user.paused && consent === "GRANTED") redirect("/paused");
  return user;
}

/**
 * Where to send a user after signing in or finishing a sign-up step: the next
 * step they still need, else `fallback`. Actions redirect here directly so the
 * address bar always matches the page shown.
 */
export function landingPath(
  u: { kind: string; needsSetup: boolean; birthDate: Date | null; consent: string; paused: boolean },
  fallback = "/",
): string {
  if (u.kind === "FAMILY") return fallback.startsWith("/family") || fallback.startsWith("/approve") ? fallback : "/family";
  if (u.needsSetup) return "/onboarding";
  if (!u.birthDate) return "/confirm-age";
  if (u.consent === "PENDING" || u.consent === "REVOKED" || (u.consent === "NOT_REQUIRED" && needsConsent(u.birthDate))) return "/family-consent";
  if (u.paused) return "/paused";
  return fallback;
}

/**
 * For the family dashboard: any signed-in parent (a family account, or a writer
 * with linked children). Locked or paused kids and banned users can't get in.
 */
export async function requireParent(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/family/login");
  if (user.kind === "FAMILY") return user;
  return requireUser();
}
