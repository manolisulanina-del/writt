"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  applyYoungerRestrictionsAction,
  approveBookAction,
  declineBookAction,
  deleteChildAction,
  regrantConsentAction,
  resetControlsAction,
  revokeConsentAction,
  setControlAction,
  setPausedAction,
} from "@/actions/family";
import { Button, buttonClass } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormError } from "@/components/ui/Field";
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; error: string };

/** Runs a family action, shows its error, and refreshes the page on success. */
function useFamilyAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  return { pending, error, run };
}

export type ControlRow = { key: string; label: string; detail: string; on: boolean; changed: boolean };

/** One on/off row per restriction or switch. */
export function ControlList({ childId, rows, title }: { childId: string; rows: ControlRow[]; title: string }) {
  const { pending, error, run } = useFamilyAction();
  // Show a switch's new position right away; the server's answer (on refresh) confirms it, or puts it back.
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const change = (key: string, on: boolean) => {
    setShown((s) => ({ ...s, [key]: on }));
    run(async () => {
      const result = await setControlAction(childId, key, on);
      if (!result.ok) setShown((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== key)));
      return result;
    });
  };
  return (
    <fieldset className={cn("space-y-2", pending && "opacity-70")} aria-busy={pending}>
      <legend className="sr-only">{title}</legend>
      <FormError message={error ?? undefined} />
      {rows.map((r) => (
        <label key={r.key} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
          <input
            type="checkbox"
            role="switch"
            checked={shown[r.key] ?? r.on}
            disabled={pending}
            onChange={(e) => change(r.key, e.target.checked)}
            className="mt-1 size-4 accent-[var(--accent)]"
            aria-describedby={`${r.key}-detail`}
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              {r.label}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", (shown[r.key] ?? r.on) ? "bg-accent-soft text-accent" : "bg-muted text-ink-soft")}>
                {(shown[r.key] ?? r.on) ? "On" : "Off"}
              </span>
              {r.changed && <span className="text-xs font-normal text-ink-soft">changed by you</span>}
            </span>
            <span id={`${r.key}-detail`} className="mt-0.5 block text-sm text-ink-soft">
              {r.detail}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function RestrictionButtons({ childId, older }: { childId: string; older: boolean }) {
  const { pending, error, run } = useFamilyAction();
  return (
    <div className="space-y-2">
      <FormError message={error ?? undefined} />
      <div className="flex flex-wrap gap-2">
        {older && (
          <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => applyYoungerRestrictionsAction(childId))}>
            Use younger restrictions
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => resetControlsAction(childId))}>
          Reset to the defaults for their age
        </Button>
      </div>
    </div>
  );
}

export function BookApproval({ childId, fanficId }: { childId: string; fanficId: string }) {
  const { pending, error, run } = useFamilyAction();
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Button size="sm" loading={pending} onClick={() => run(() => approveBookAction(childId, fanficId))}>
          Approve
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => declineBookAction(childId, fanficId))}>
          Not yet
        </Button>
      </div>
      <FormError message={error ?? undefined} />
    </div>
  );
}

export function AccountActions({ childId, username, paused, consent }: { childId: string; username: string; paused: boolean; consent: string }) {
  const { pending, error, run } = useFamilyAction();
  const [confirm, setConfirm] = useState<"revoke" | "delete" | null>(null);
  const [agree, setAgree] = useState(false);
  return (
    <div className="space-y-3">
      <FormError message={error ?? undefined} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => setPausedAction(childId, !paused))}>
          {paused ? "Unpause the account" : "Pause the account"}
        </Button>
        <a href={`/api/family/export/${childId}`} className={buttonClass("secondary", "sm")}>
          Download all their data
        </a>
        {consent === "GRANTED" && (
          <Button variant="ghost" size="sm" onClick={() => setConfirm("revoke")}>
            Remove my permission
          </Button>
        )}
        <Button variant="danger" size="sm" onClick={() => setConfirm("delete")}>
          Delete the account
        </Button>
      </div>
      {consent === "REVOKED" && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-sm">The account is locked because you removed your permission.</p>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
            <span>I am this child’s parent or guardian and I give permission.</span>
          </label>
          <Button size="sm" className="mt-3" disabled={!agree} loading={pending} onClick={() => run(() => regrantConsentAction(childId, agree))}>
            Give permission again
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirm === "revoke"}
        onCancel={() => setConfirm(null)}
        title="Remove your permission?"
        confirmLabel="Remove permission"
        pending={pending}
        onConfirm={() => {
          setConfirm(null);
          run(() => revokeConsentAction(childId));
        }}
      >
        <p className="text-sm text-ink-soft">@{username}’s account will be locked until you give permission again. Nothing is deleted.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "delete"}
        onCancel={() => setConfirm(null)}
        title={`Delete @${username}’s account?`}
        confirmLabel="Delete for good"
        pending={pending}
        onConfirm={() => run(() => deleteChildAction(childId))}
      >
        <p className="text-sm text-ink-soft">Their books, comments, coins and everything else will be deleted. This can’t be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
