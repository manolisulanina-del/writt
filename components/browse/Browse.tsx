import { FanficCard, FanficGrid } from "@/components/fanfic/FanficCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LENGTHS, RATINGS, SORTS, type SortValue } from "@/lib/content";
import { browseBooks, type BrowseFilters } from "@/lib/queries";
import { inputClass } from "@/components/ui/Field";
import type { ViewerContext } from "@/lib/viewer";

type SearchParams = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function readFilters(sp: SearchParams): BrowseFilters {
  const sort = SORTS.find((s) => s.value === sp.sort)?.value ?? "hot";
  return { q: str(sp.q), rating: str(sp.rating), status: str(sp.status), length: str(sp.length), sort: sort as SortValue };
}

/** GET form so filters live in the URL and can be shared or bookmarked. */
export function FilterBar({ action, filters, showSearch = true }: { action: string; filters: BrowseFilters; showSearch?: boolean }) {
  const select = `${inputClass} h-10 py-0`;
  return (
    <form action={action} role="search" className="mb-8 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(4,1fr)_auto]">
      {showSearch ? (
        <label className="block">
          <span className="sr-only">Search</span>
          <input name="q" defaultValue={filters.q} placeholder="Title, @author, fandom or tag" className={`${inputClass} h-10`} />
        </label>
      ) : (
        <span className="hidden lg:block" />
      )}
      <label className="block">
        <span className="sr-only">Age range</span>
        <select name="rating" defaultValue={filters.rating} className={select}>
          <option value="">Any age range</option>
          {RATINGS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label} ({r.ages})
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">Status</span>
        <select name="status" defaultValue={filters.status} className={select}>
          <option value="">Completed or ongoing</option>
          <option value="COMPLETED">Completed</option>
          <option value="ONGOING">Ongoing</option>
        </select>
      </label>
      <label className="block">
        <span className="sr-only">Length</span>
        <select name="length" defaultValue={filters.length} className={select}>
          <option value="">Any length</option>
          {LENGTHS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">Sort by</span>
        <select name="sort" defaultValue={filters.sort} className={select}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="h-10 rounded-xl bg-ink px-5 text-sm font-semibold text-paper hover:opacity-90">
        Apply
      </button>
    </form>
  );
}

export async function Results({ filters, ctx }: { filters: BrowseFilters; ctx: ViewerContext }) {
  const books = await browseBooks(filters, ctx);
  if (books.length === 0) {
    return <EmptyState title="No books found">Try a different search, or loosen the filters.</EmptyState>;
  }
  return (
    <>
      <p className="mb-4 text-sm text-ink-soft">
        {books.length === 48 ? "Showing the first 48 books" : `${books.length} book${books.length === 1 ? "" : "s"}`}
      </p>
      <FanficGrid>
        {books.map((b, i) => (
          <FanficCard key={b.id} story={b} priority={i < 4} />
        ))}
      </FanficGrid>
    </>
  );
}
