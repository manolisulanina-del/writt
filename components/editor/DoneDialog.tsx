"use client";

import type { Visibility } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { FormError } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import type { PostingRules } from "@/lib/kids";

const OPTIONS: { value: Visibility; title: string; body: string }[] = [
  { value: "DRAFT", title: "Draft", body: "Save it and keep working. Nobody else can see it." },
  { value: "PRIVATE", title: "Post privately", body: "Published, but only visible to you." },
  { value: "PUBLIC", title: "Post", body: "Public on Writt for everyone to read." },
];

export function DoneDialog({
  open,
  onClose,
  onChoose,
  saving,
  error,
  current,
  rules,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (visibility: Visibility) => void;
  saving: Visibility | null;
  error: string | null;
  current?: Visibility;
  rules?: PostingRules;
}) {
  // Kids: no posting while a parent has publishing off; public posts wait for a parent's approval.
  const options = OPTIONS.filter((o) => !rules || rules.canPublish || o.value === "DRAFT").map((o) =>
    o.value === "PUBLIC" && rules?.needsApproval
      ? { ...o, title: "Ask to post", body: "Your parent reads it first. It’s posted for everyone once they approve." }
      : o,
  );
  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="What would you like to do?" description="You can change this any time from your profile.">
      <div className="space-y-3 p-5">
        <FormError message={error ?? undefined} />
        {rules && !rules.canPublish && (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm">Your parent turned off publishing for now, so you can save drafts.</p>
        )}
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={saving !== null}
            onClick={() => onChoose(option.value)}
            className={cn(
              "flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition disabled:opacity-60",
              option.value === "PUBLIC"
                ? "border-accent bg-accent text-on-accent hover:bg-accent-strong"
                : "border-line bg-surface hover:border-ink-soft/50 hover:bg-muted",
            )}
          >
            <span className="flex-1">
              <span className="flex items-center gap-2 font-semibold">
                {option.title}
                {current === option.value && (
                  <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] tracking-wide uppercase">Current</span>
                )}
              </span>
              <span className={cn("mt-0.5 block text-sm", option.value === "PUBLIC" ? "opacity-85" : "text-ink-soft")}>{option.body}</span>
            </span>
            {saving === option.value && <Spinner />}
          </button>
        ))}
      </div>
    </Modal>
  );
}
