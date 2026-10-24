"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reportAction } from "@/actions/engagement";
import { REPORT_REASONS, type ReportReasonValue } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { FormError, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

export function ReportModal({
  open,
  onClose,
  fanficId,
  onReported,
}: {
  open: boolean;
  onClose: () => void;
  fanficId: string;
  onReported: () => void;
}) {
  const [reason, setReason] = useState<ReportReasonValue | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    if (!reason) {
      setError("Choose a reason.");
      return;
    }
    start(async () => {
      const result = await reportAction({ fanficId, reason, details });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.removed) {
        // The book no longer exists for readers, so leave its page now.
        router.push("/?reported=removed");
        return;
      }
      setDone(true);
      onReported();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Report this story" description="Reports are confidential. The author won’t know who reported.">
      {done ? (
        <div className="space-y-4 p-5" role="status">
          <p className="font-semibold">Thanks for letting us know.</p>
          <p className="text-sm text-ink-soft">Our moderators will review this story.</p>
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormError message={error ?? undefined} />
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">What’s wrong with it?</legend>
            <div className="grid gap-1.5">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                    reason === r.value ? "border-accent bg-accent-soft font-semibold" : "border-line hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-[var(--accent)]"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>
          {reason && (
            <div className="space-y-1.5">
              <label htmlFor="report-details" className="text-sm font-semibold">
                {reason === "OTHER" ? "Tell us what’s wrong" : "Anything else? (optional)"}
              </label>
              <Textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={1000}
                required={reason === "OTHER"}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              Submit report
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
