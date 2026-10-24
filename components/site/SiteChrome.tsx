import Link from "next/link";
import { redirect } from "next/navigation";
import { isBanned } from "@/auth";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";
import { getSiteSettings } from "@/lib/settings";
import { WarningModal } from "./WarningModal";

/** The admin's /announce banner. Cached with the site settings, so it's part of the static shell. */
export async function AnnouncementBanner() {
  const { announcement } = await getSiteSettings();
  if (!announcement) return null;
  return (
    <div role="region" aria-label="Announcement" className="bg-plum px-4 py-2.5 text-center text-sm font-semibold text-[#f6f1e7] dark:text-ink">
      {announcement}
    </div>
  );
}

/**
 * Sends banned users to /banned and, during maintenance, everyone but the
 * admin to /maintenance. Rendered beside the page (not around it) so pages
 * keep streaming; requireUser() enforces the same rules for every action.
 */
export async function SiteGate() {
  const user = await getCurrentUser();
  if (!user || isAdmin(user)) return null;
  if (isBanned(user)) redirect("/banned");
  if ((await getSiteSettings()).maintenance) redirect("/maintenance");
  return null;
}

/** Shows unread admin warnings once, the next time the user opens Writt. */
export async function WarningGate() {
  const user = await getCurrentUser();
  if (!user) return null;
  const warnings = await prisma.notification.findMany({
    where: { userId: user.id, kind: "WARNING", read: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, createdAt: true },
  });
  if (warnings.length === 0) return null;
  return <WarningModal warnings={warnings.map((w) => ({ id: w.id, body: w.body, at: w.createdAt.toISOString() }))} />;
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 pb-24 text-sm text-ink-soft sm:px-6">
        <span className="font-display italic">Writt</span>
        <Link href="/messages" className="hover:text-ink">
          Message admin
        </Link>
        <Link href="/appeals" className="hover:text-ink">
          My appeals
        </Link>
        <Link href="/notifications" className="hover:text-ink">
          Notifications
        </Link>
        <Link href="/library" className="hover:text-ink">
          Library
        </Link>
        <Link href="/settings" className="hover:text-ink">
          Settings
        </Link>
      </div>
    </footer>
  );
}
