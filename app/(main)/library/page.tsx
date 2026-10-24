import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FanficCard, FanficGrid } from "@/components/fanfic/FanficCard";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { getContinueReading, getLibrary } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { getViewerContext } from "@/lib/viewer";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Your library</h1>
      <p className="mt-1 mb-8 text-ink-soft">Books you saved. You’ll get a notification when any of them gets a new chapter.</p>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Body />
      </Suspense>
    </div>
  );
}

async function Body() {
  const user = await requireUser();
  const ctx = await getViewerContext(user);
  const [books, progress] = await Promise.all([getLibrary(ctx), getContinueReading(ctx, 50)]);
  if (books.length === 0) {
    return (
      <EmptyState title="Nothing saved yet" action={<LinkButton href="/browse">Find something to read</LinkButton>}>
        Press <strong>Save</strong> on any book to keep it here.
      </EmptyState>
    );
  }
  const resume = new Map(progress.map((p) => [p.book.id, p]));
  return (
    <FanficGrid>
      {books.map((b) => {
        const where = resume.get(b.id);
        return (
          <FanficCard
            key={b.id}
            story={b}
            footer={
              where && (
                <Link href={where.href} className="text-xs font-bold tracking-widest text-accent uppercase hover:underline">
                  Continue · {where.label} →
                </Link>
              )
            }
          />
        );
      })}
    </FanficGrid>
  );
}
