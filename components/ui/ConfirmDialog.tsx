"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";
import { FormError } from "./Field";
import { Modal } from "./Modal";

/** In-page "Are you sure?" popup used before destructive actions. */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title = "Are you sure?",
  children,
  confirmLabel = "Yes",
  danger = true,
  pending,
  error,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  error?: string | null;
}) {
  return (
    <Modal open={open} onClose={() => !pending && onCancel()} title={title}>
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        {children}
        <FormError message={error ?? undefined} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
