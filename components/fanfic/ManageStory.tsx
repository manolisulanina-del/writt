"use client";

import type { Visibility } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteFanficAction, setVisibilityAction } from "@/actions/fanfic";
import { LinkButton } from "@/components/ui/Button";
import { PenIcon, TrashIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const LABELS: Record<Visibility, string> = { PUBLIC: "Public", PRIVATE: "Private", DRAFT: "Draft" };

/** Author controls: edit, change visibility, delete. Every action is re-authorized on the server. */
export function ManageStory({
  fanficId,
  visibility,
  afterDelete,
  compact,
}: {
  fanficId: string;
  visibility: Visibility;
  /** Where to go after deleting; omit to just refresh the current page. */
  afterDelete?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeVisibility(next: Visibility) {
    start(async () => {
      const result = await setVisibilityAction(fanficId, next);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!window.confirm("Delete this story for good? Chapters, comments and likes will be removed too.")) return;
    start(async () => {
      const result = await deleteFanficAction(fanficId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (afterDelete) router.push(afterDelete);
      else router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-60")} aria-busy={pending}>
      <LinkButton href={`/fanfic/${fanficId}/edit`} variant="secondary" size="sm">
        <PenIcon className="size-3.5" /> Edit
      </LinkButton>
      <label className="sr-only" htmlFor={`vis-${fanficId}`}>
        Visibility
      </label>
      <select
        id={`vis-${fanficId}`}
        value={visibility}
        disabled={pending}
        onChange={(e) => changeVisibility(e.target.value as Visibility)}
        className="h-8 rounded-lg border border-line bg-surface px-2 text-sm font-semibold"
      >
        {(Object.keys(LABELS) as Visibility[]).map((v) => (
          <option key={v} value={v}>
            {LABELS[v]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-soft hover:bg-danger/10 hover:text-danger"
        aria-label="Delete story"
      >
        <TrashIcon className="size-4" />
        {!compact && "Delete"}
      </button>
      {error && (
        <p role="alert" className="w-full text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
