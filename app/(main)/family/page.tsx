import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signOutAction } from "@/actions/auth";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { prisma } from "@/lib/db";
import { ageFrom } from "@/lib/content";
import { GROUP_INFO, kidGroupForAge } from "@/lib/kids";
import { requireParent } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Family" };

export default function FamilyPage(props: PageProps<"/family">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-sm font-bold tracking-widest text-accent uppercase">Family dashboard</p>
      <h1 className="mt-1 mb-8 font-display text-4xl font-semibold tracking-tight">Your children on Writt</h1>
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Body searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const STATUS: Record<string, { label: string; tone: string }> = {
  GRANTED: { label: "Active", tone: "bg-success/10 text-success" },
  REVOKED: { label: "Locked: permission removed", tone: "bg-danger/10 text-danger" },
  PENDING: { label: "Waiting for approval", tone: "bg-accent-soft text-accent" },
};

async function Body({ searchParams }: { searchParams: PageProps<"/family">["searchParams"] }) {
  const [parent, sp] = await Promise.all([requireParent(), searchParams]);
  const links = await prisma.familyLink.findMany({
    where: { parentId: parent.id },
    orderBy: { createdAt: "asc" },
    select: {
      child: {
        select: {
          id: true,
          username: true,
          image: true,
          birthDate: true,
          consent: true,
          paused: true,
          coins: true,
          _count: { select: { fanfics: { where: { awaitingApproval: true } } } },
        },
      },
    },
  });
  const notices = await prisma.notification.findMany({
    where: { userId: parent.id, kind: "FAMILY" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, title: true, body: true, createdAt: true, link: true },
  });

  return (
    <div className="space-y-10">
      {sp.deleted && (
        <p role="status" className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
          The account and everything in it was deleted.
        </p>
      )}
      {links.length === 0 ? (
        <EmptyState title="No children linked yet">
          When your child signs up for Writt, they’ll ask for your email or phone number. Approve their account from the message we send you, and
          they’ll show up here.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {links.map(({ child }) => {
            const age = ageFrom(child.birthDate);
            const group = kidGroupForAge(age);
            const status = child.paused && child.consent === "GRANTED" ? { label: "Paused", tone: "bg-muted text-ink-soft" } : STATUS[child.consent];
            return (
              <li key={child.id}>
                <Link
                  href={`/family/${child.id}`}
                  className="flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <div className="flex items-center gap-3">
                    <Avatar src={child.image} name={child.username} size={48} />
                    <div className="min-w-0">
                      <p className="truncate font-display text-xl font-semibold">@{child.username}</p>
                      <p className="text-sm text-ink-soft">
                        {age} years old{group ? ` · ${GROUP_INFO[group].label} group (${GROUP_INFO[group].ages})` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2 text-xs font-semibold">
                    {status && <span className={cn("rounded-full px-2.5 py-1", status.tone)}>{status.label}</span>}
                    <span className="rounded-full bg-muted px-2.5 py-1 text-ink-soft">{child.coins} coins</span>
                    {child._count.fanfics > 0 && (
                      <span className="rounded-full bg-accent px-2.5 py-1 text-on-accent">
                        {child._count.fanfics} book{child._count.fanfics === 1 ? "" : "s"} to approve
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {notices.length > 0 && (
        <section aria-labelledby="family-news">
          <h2 id="family-news" className="mb-3 font-display text-2xl font-semibold">
            Recent updates
          </h2>
          <ul className="space-y-2">
            {notices.map((n) => (
              <li key={n.id} className="rounded-xl border border-line bg-surface p-4 text-sm">
                <p className="font-semibold">{n.title}</p>
                <p className="mt-0.5 text-ink-soft">{n.body}</p>
                <RelativeTime iso={n.createdAt.toISOString()} className="mt-1 block text-xs text-ink-soft" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-ink-soft">
        <Link href="/parents" className="font-semibold text-accent hover:underline">
          How family accounts work
        </Link>
      </p>
      {parent.kind === "FAMILY" && (
        <form action={signOutAction}>
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      )}
    </div>
  );
}
