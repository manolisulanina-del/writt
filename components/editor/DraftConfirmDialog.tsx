"use client";

import type { Visibility } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";

/** "Are you sure?" before saving as a draft. Cancel saves nothing. */
export function DraftConfirmDialog({
  open,
  onCancel,
  onConfirm,
  saving,
  error,
  current,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
  error: string | null;
  current?: Visibility;
}) {
  const published = current === "PUBLIC" || current === "PRIVATE";
  return (
    <Modal open={open} onClose={() => !saving && onCancel()} title="Are you sure?">
      <div className="space-y-4 p-5">
        <p className="text-sm text-ink-soft">
          Your book will be saved as a draft. It won’t be published, and you can open it from the Drafts tab on your
          profile to keep writing later.
        </p>
        {published && (
          <p className="rounded-xl border border-plum/30 bg-plum-soft px-3.5 py-2.5 text-sm font-medium text-plum">
            This book is currently posted. Saving it as a draft will hide it from readers until you post it again.
          </p>
        )}
        <FormError message={error ?? undefined} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onConfirm} loading={saving}>
            Yes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
