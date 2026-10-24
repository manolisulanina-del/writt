import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AppealReply } from "@/components/appeals/AppealReply";
import { Skeleton } from "@/components/ui/EmptyState";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { isObjectId, prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";
import { cn } from "@/lib/utils";
import { STATUS_STYLE } from "@/components/appeals/status";

export const metadata: Metadata = { title: "Appeal" };

export default function AppealPage(props: PageProps<"/appeals/[id]">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/appeals" className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← My appeals
      </Link>
      <Suspense fallback={<Skeleton className="mt-6 h-96" />}>
        <Appeal params={props.params} />
      </Suspense>
    </div>
  );
}

async function Appeal({ params }: { params: PageProps<"/appeals/[id]">["params"] }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  if (isAdmin(user)) redirect(`/admin?tab=appeals&id=${id}`);
  if (!isObjectId(id)) notFound();
  // Only the person who sent the appeal can read it.
  const appeal = await prisma.appeal.findFirst({
    where: { id, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!appeal) notFound();

  return (
    <article className="mt-6 space-y-6">
      <header>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold uppercase", STATUS_STYLE[appeal.status])}>{appeal.status.toLowerCase()}</span>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{appeal.bookTitle}</h1>
        <p className="text-sm text-ink-soft">
          Appeal sent <RelativeTime iso={appeal.createdAt.toISOString()} />
        </p>
      </header>

      <ol className="space-y-3" aria-label="Conversation with the admin">
        <li className="ml-auto max-w-[85%] rounded-2xl bg-accent-soft px-4 py-3">
          <p className="text-xs font-semibold text-ink-soft">You</p>
          <p className="mt-1 whitespace-pre-wrap">{appeal.message}</p>
        </li>
        {appeal.messages.map((m) => (
          <li key={m.id} className={cn("max-w-[85%] rounded-2xl px-4 py-3", m.fromAdmin ? "bg-ink text-paper" : "ml-auto bg-accent-soft")}>
            <p className="text-xs font-semibold opacity-70">
              {m.fromAdmin ? "Writt admin" : "You"} · <RelativeTime iso={m.createdAt.toISOString()} />
            </p>
            <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>

      {appeal.status === "OPEN" ? (
        <AppealReply appealId={appeal.id} />
      ) : (
        <div className={cn("rounded-2xl px-4 py-3", appeal.status === "APPROVED" ? "bg-success/10" : "bg-danger/10")}>
          <p className="font-semibold">
            {appeal.status === "APPROVED" ? "Approved: the book is back on Writt." : "Denied: the book stays removed."}
          </p>
          {appeal.decision && <p className="mt-1 text-sm whitespace-pre-wrap">{appeal.status === "DENIED" ? "Reason: " : ""}{appeal.decision}</p>}
        </div>
      )}
    </article>
  );
}
