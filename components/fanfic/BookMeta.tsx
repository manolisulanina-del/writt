import Link from "next/link";
import { RATING_AGES, RATING_LABEL, STATUS_LABEL, readingTime } from "@/lib/content";
import { cn, formatCount } from "@/lib/utils";

const RATING_STYLE: Record<string, string> = {
  EVERYONE: "border-success/40 text-success",
  TEEN: "border-[#b7791f]/50 text-[#9a6216] dark:text-[#e5b25c]",
  MATURE: "border-danger/50 text-danger",
};

export function RatingBadge({ rating, className }: { rating: string | null; className?: string }) {
  if (!rating) return null;
  return (
    <span
      className={cn("inline-flex items-center rounded-md border bg-surface px-1.5 py-px text-[10px] font-black tracking-widest uppercase", RATING_STYLE[rating], className)}
      title={`Age range: ${RATING_LABEL[rating]} (${RATING_AGES[rating]})`}
    >
      {RATING_LABEL[rating]} · {RATING_AGES[rating]}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-px text-[10px] font-black tracking-widest uppercase",
        status === "COMPLETED" ? "bg-ink text-paper" : "bg-muted text-ink-soft",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** "12.4K words · 3 chapters · 54 min" */
export function LengthLine({ words, chapters, className }: { words: number; chapters: number; className?: string }) {
  return (
    <p className={cn("text-xs text-ink-soft tabular-nums", className)}>
      {formatCount(words)} words · {chapters} chapter{chapters === 1 ? "" : "s"} · {readingTime(words)} read
    </p>
  );
}

export function WarningsLine({ warnings, className }: { warnings: string[]; className?: string }) {
  if (!warnings.length) return null;
  return (
    <p className={cn("text-xs font-medium text-danger", className)}>
      <span aria-hidden>⚠ </span>
      <span className="sr-only">Warnings: </span>
      {warnings.join(", ")}
    </p>
  );
}

export function TagChips({ tags, className }: { tags: { id: string; name: string; kind: string }[]; className?: string }) {
  if (!tags.length) return null;
  const sorted = [...tags].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "FANDOM" ? -1 : 1));
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Fandoms and tags">
      {sorted.map((t) => (
        <li key={t.id}>
          <Link
            href={`/t/${t.id}`}
            className={cn(
              "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold transition hover:ring-2 hover:ring-accent/30",
              t.kind === "FANDOM" ? "bg-plum text-[#f6f1e7] dark:text-ink" : "bg-plum-soft text-plum",
            )}
          >
            {t.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
