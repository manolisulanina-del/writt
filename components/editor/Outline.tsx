"use client";

import { cn } from "@/lib/utils";
import { ChevronIcon, TrashIcon } from "@/components/ui/icons";
import { pagePreview, type DraftStory, type Location } from "./model";

type OutlineProps = {
  story: DraftStory;
  active: Location;
  onOpen: (pageKey: string) => void;
  onMoveChapter: (c: number, delta: -1 | 1) => void;
  onDeleteChapter: (c: number) => void;
  onMovePage: (loc: Location, delta: -1 | 1) => void;
  onDeletePage: (loc: Location) => void;
};

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md p-1 text-ink-soft hover:bg-muted hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** Chapter and page list: navigate, reorder and delete. */
export function Outline({ story, active, onOpen, onMoveChapter, onDeleteChapter, onMovePage, onDeletePage }: OutlineProps) {
  return (
    <nav aria-label="Chapters and pages">
      <ol className="space-y-3">
        {story.chapters.map((chapter, c) => (
          <li key={chapter.key} className="rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-1 border-b border-line px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                <span className="text-ink-soft">Ch. {c + 1}</span> {chapter.title || <span className="text-ink-soft italic">Untitled</span>}
              </span>
              <IconButton label={`Move chapter ${c + 1} up`} disabled={c === 0} onClick={() => onMoveChapter(c, -1)}>
                <ChevronIcon dir="up" className="size-4" />
              </IconButton>
              <IconButton
                label={`Move chapter ${c + 1} down`}
                disabled={c === story.chapters.length - 1}
                onClick={() => onMoveChapter(c, 1)}
              >
                <ChevronIcon dir="down" className="size-4" />
              </IconButton>
              <IconButton
                label={`Delete chapter ${c + 1}`}
                disabled={story.chapters.length === 1}
                onClick={() => {
                  if (window.confirm(`Delete chapter ${c + 1} and all ${chapter.pages.length} of its pages?`)) onDeleteChapter(c);
                }}
              >
                <TrashIcon className="size-4" />
              </IconButton>
            </div>
            <ol className="p-1.5">
              {chapter.pages.map((page, p) => {
                const isActive = active.c === c && active.p === p;
                const preview = pagePreview(page.content);
                return (
                  <li key={page.key} className="group flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onOpen(page.key)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-left text-sm transition",
                        isActive ? "bg-accent-soft font-semibold text-accent" : "hover:bg-muted",
                      )}
                    >
                      <span className="block">Page {p + 1}</span>
                      <span className={cn("block truncate text-xs font-normal", isActive ? "text-accent/80" : "text-ink-soft")}>
                        {preview || "Empty page"}
                      </span>
                    </button>
                    <div className="flex opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <IconButton label={`Move page ${p + 1} up`} disabled={p === 0} onClick={() => onMovePage({ c, p }, -1)}>
                        <ChevronIcon dir="up" className="size-4" />
                      </IconButton>
                      <IconButton
                        label={`Move page ${p + 1} down`}
                        disabled={p === chapter.pages.length - 1}
                        onClick={() => onMovePage({ c, p }, 1)}
                      >
                        <ChevronIcon dir="down" className="size-4" />
                      </IconButton>
                      <IconButton
                        label={`Delete page ${p + 1}`}
                        disabled={chapter.pages.length === 1}
                        onClick={() => {
                          if (!preview || window.confirm(`Delete page ${p + 1}? This can’t be undone.`)) onDeletePage({ c, p });
                        }}
                      >
                        <TrashIcon className="size-4" />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  );
}
