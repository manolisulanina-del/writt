import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { STATUS_STYLE } from "@/components/appeals/status";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My appeals" };

export default function AppealsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">My appeals</h1>
          <p className="mt-1 text-ink-soft">Your messages to the Writt admin about removed books.</p>
        </div>
        <LinkButton href="/appeals/new">Appeal a removal</LinkButton>
      </div>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const user = await requireUser();
  const appeals = await prisma.appeal.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, bookTitle: true, status: true, updatedAt: true, awaitingAdmin: true },
  });
  if (appeals.length === 0) {
    return <EmptyState title="No appeals">If you think a book was removed unfairly, you can message the admin.</EmptyState>;
  }
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {appeals.map((a) => (
        <li key={a.id}>
          <Link href={`/appeals/${a.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{a.bookTitle}</span>
              <span className="text-xs text-ink-soft">
                Updated <RelativeTime iso={a.updatedAt.toISOString()} />
                {a.status === "OPEN" && !a.awaitingAdmin && " · the admin replied"}
              </span>
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold uppercase", STATUS_STYLE[a.status])}>{a.status.toLowerCase()}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
