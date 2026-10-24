import type { Metadata } from "next";
import { Suspense } from "react";
import { FilterBar, Results, readFilters } from "@/components/browse/Browse";
import { Skeleton } from "@/components/ui/EmptyState";
import { requireUser } from "@/lib/session";
import { getViewerContext } from "@/lib/viewer";

export const metadata: Metadata = { title: "Browse" };

export default function BrowsePage(props: PageProps<"/browse">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 font-display text-4xl font-semibold tracking-tight">Browse</h1>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Body searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/browse">["searchParams"] }) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);
  const filters = readFilters(sp);
  const ctx = await getViewerContext(user);
  return (
    <>
      <FilterBar action="/browse" filters={filters} />
      {filters.q && (
        <h2 className="mb-2 font-display text-2xl font-semibold">
          Results for “{filters.q}”
        </h2>
      )}
      <Results filters={filters} ctx={ctx} />
    </>
  );
}
