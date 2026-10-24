"use client";

import { useState, useTransition } from "react";
import { acknowledgeWarningsAction } from "@/actions/notifications";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RelativeTime } from "@/components/ui/RelativeTime";

export function WarningModal({ warnings }: { warnings: { id: string; body: string; at: string }[] }) {
  const [open, setOpen] = useState(true);
  const [pending, start] = useTransition();
  const acknowledge = () =>
    start(async () => {
      await acknowledgeWarningsAction();
      setOpen(false);
    });

  return (
    <Modal open={open} onClose={acknowledge} title={warnings.length === 1 ? "A warning from the Writt admin" : `${warnings.length} warnings from the Writt admin`}>
      <div className="space-y-4 p-5">
        <ul className="space-y-3">
          {warnings.map((w) => (
            <li key={w.id} className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
              <p className="whitespace-pre-wrap">{w.body}</p>
              <RelativeTime iso={w.at} className="mt-1 block text-xs text-ink-soft" />
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-soft">Please follow the community rules. Repeated problems can lead to a ban.</p>
        <Button onClick={acknowledge} loading={pending} className="w-full">
          I understand
        </Button>
      </div>
    </Modal>
  );
}
