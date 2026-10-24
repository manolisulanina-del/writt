import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppealForm } from "@/components/appeals/AppealForm";
import { Skeleton } from "@/components/ui/EmptyState";
import { isObjectId, prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Appeal a removal" };

export default function NewAppealPage(props: PageProps<"/appeals/new">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Appeal a removal</h1>
      <p className="mt-1 mb-8 text-ink-soft">
        Think a book was removed unfairly? Tell the admin why. Replies show up in your notifications. For anything else,{" "}
        <Link href="/messages" className="font-semibold text-accent hover:underline">
          message the admin
        </Link>
        .
      </p>
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/appeals/new">["searchParams"] }) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const bookId = typeof sp.book === "string" && isObjectId(sp.book) ? sp.book : null;
  // Prefill from "Appeal this removal" links, only for books the user can name anyway.
  const book = bookId
    ? await prisma.fanfic.findFirst({ where: { id: bookId, removed: true }, select: { id: true, title: true, authorId: true } })
    : null;
  return <AppealForm prefill={book ? { link: `/fanfic/${book.id}`, title: book.title, own: book.authorId === user.id } : null} />;
}
