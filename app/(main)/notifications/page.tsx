import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MarkNotificationsRead } from "@/components/site/MarkNotificationsRead";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

const ACTION_LABEL: Record<string, string> = {
  BOOK_REMOVED: "Appeal this removal",
  BOOK_RESTORED: "Open book",
  RENAMED: "Open profile",
  RATING_CHANGED: "Open book",
  BIRTHDATE_CHANGED: "Open settings",
  APPEAL_NEW: "Open appeal",
  APPEAL_REPLY: "Open conversation",
  APPEAL_APPROVED: "Open appeal",
  APPEAL_DENIED: "Open appeal",
  NEW_BOOK: "Read it",
  NEW_CHAPTER: "Read the new chapter",
  FAMILY: "Open",
  BOOK_APPROVAL: "Open book",
  COINS: "Open the shop",
  MESSAGE: "Open messages",
};

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 font-display text-4xl font-semibold tracking-tight">Notifications</h1>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  if (items.length === 0) return <EmptyState title="Nothing yet">Messages from the admin and updates on your appeals show up here.</EmptyState>;

  return (
    <>
      <MarkNotificationsRead hasUnread={items.some((n) => !n.read)} />
      <ul className="space-y-3">
        {items.map((n) => (
          <li key={n.id} className={cn("rounded-2xl border bg-surface p-4", n.read ? "border-line" : "border-accent/40 shadow-card")}>
            <div className="flex items-start gap-3">
              {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{n.title}</p>
                <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink-soft">{n.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
                  <RelativeTime iso={n.createdAt.toISOString()} />
                  {n.link && (
                    <Link href={n.link} className="font-semibold text-accent hover:underline">
                      {ACTION_LABEL[n.kind] ?? "Open"} →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
