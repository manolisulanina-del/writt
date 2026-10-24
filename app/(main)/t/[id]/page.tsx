import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FilterBar, Results, readFilters } from "@/components/browse/Browse";
import { Handle } from "@/components/ui/AdminBadge";
import { Skeleton } from "@/components/ui/EmptyState";
import { getTag } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { getViewerContext } from "@/lib/viewer";

export const metadata: Metadata = { title: "Tag" };

/** Every public book with one fandom or tag, with the same filters as Browse. */
export default function TagPage(props: PageProps<"/t/[id]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Body params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ params, searchParams }: { params: PageProps<"/t/[id]">["params"]; searchParams: PageProps<"/t/[id]">["searchParams"] }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const tag = await getTag(id);
  if (!tag) notFound();
  const ctx = await getViewerContext(user);
  const filters = { ...readFilters(sp), tagIds: [tag.id] };

  return (
    <>
      <header className="mb-8">
        <p className="text-xs font-bold tracking-widest text-accent uppercase">{tag.kind === "FANDOM" ? "Fandom" : "Tag"}</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{tag.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
          {tag.books} public book{tag.books === 1 ? "" : "s"} ·{" "}
          {tag.createdBy ? (
            <>
              created by{" "}
              <Link href={`/u/${tag.createdBy.username}`} className="font-semibold hover:text-ink">
                <Handle username={tag.createdBy.username} role={tag.createdBy.role} />
              </Link>
            </>
          ) : (
            "creator’s account was deleted"
          )}
        </p>
      </header>
      <FilterBar action={`/t/${tag.id}`} filters={filters} />
      <Results filters={filters} ctx={ctx} />
    </>
  );
}
