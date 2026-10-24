"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applyThemeAction, buyThemeAction } from "@/actions/shop";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Result = { ok: true; message: string } | { ok: false; error: string };

function Message({ result }: { result: Result | null }) {
  if (!result) return null;
  return (
    <p role="status" className={result.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
      {result.ok ? result.message : result.error}
    </p>
  );
}

/** Buy → "Are you sure? This costs 200 coins." → bought. */
export function BuyButton({ themeId, name, price }: { themeId: string; name: string; price: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  return (
    <div className="space-y-2">
      <Button size="sm" onClick={() => setOpen(true)}>
        Buy
      </Button>
      <Message result={result} />
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        title="Are you sure?"
        confirmLabel={`Buy ${name}`}
        danger={false}
        pending={pending}
        error={result && !result.ok ? result.error : null}
        onConfirm={() =>
          start(async () => {
            const r = await buyThemeAction(themeId);
            setResult(r);
            if (r.ok) {
              setOpen(false);
              router.refresh();
            }
          })
        }
      >
        <p className="text-sm">This costs {price} coins.</p>
      </ConfirmDialog>
    </div>
  );
}

export function ApplyButton({ themeId, label = "Use this theme" }: { themeId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await applyThemeAction(themeId);
            setResult(r);
            if (r.ok) router.refresh();
          })
        }
      >
        {label}
      </Button>
      <Message result={result} />
    </div>
  );
}
