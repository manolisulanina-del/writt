import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatsChart } from "@/components/stats/StatsChart";
import { Skeleton } from "@/components/ui/EmptyState";
import { isAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/session";
import { METRICS, getBookStats } from "@/lib/stats";
import { formatCount } from "@/lib/utils";

export const metadata: Metadata = { title: "Stats" };

export default function StatsPage(props: PageProps<"/fanfic/[id]/stats">) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Suspense fallback={<Skeleton className="h-[30rem]" />}>
        <Body params={props.params} />
      </Suspense>
    </div>
  );
}

async function Body({ params }: { params: PageProps<"/fanfic/[id]/stats">["params"] }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  // Only the book's author (or the admin) gets stats; everyone else sees a 404.
  const stats = await getBookStats(id, { id: user.id, isAdmin: isAdmin(user) });
  if (!stats) notFound();
  const last30 = (key: string) => stats.days.reduce((n, d) => n + (d[key as keyof typeof d] as number), 0);

  return (
    <>
      <Link href={`/fanfic/${stats.book.id}`} className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← Back to the book
      </Link>
      <p className="mt-4 text-xs font-bold tracking-widest text-accent uppercase">Writer stats</p>
      <h1 className="mt-1 mb-8 font-display text-4xl font-semibold tracking-tight">{stats.book.title}</h1>
      <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {METRICS.map((m) => (
          <div key={m.key} className="rounded-2xl border border-line bg-surface p-4">
            <dt className="text-sm text-ink-soft">{m.label}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">{formatCount(stats.totals[m.key])}</dd>
            <dd className="mt-0.5 text-xs text-ink-soft">+{formatCount(last30(m.key))} in the last 30 days</dd>
          </div>
        ))}
      </dl>
      <StatsChart metrics={METRICS} days={stats.days} />
    </>
  );
}
