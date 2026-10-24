"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { FormState } from "@/actions/auth";
import { updateContentPrefsAction } from "@/actions/preferences";
import { blockUserAction, unblockUserAction } from "@/actions/social";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormError } from "@/components/ui/Field";
import { WARNINGS } from "@/lib/content";

const formatBirthDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Date of birth (read-only), hide Mature books, hide chosen warnings. */
export function ContentPrefsForm({
  birthDate,
  ageGroup,
  hideMature,
  hiddenWarnings,
}: {
  birthDate: string | null;
  /** e.g. "Teens (13–17): you can see Everyone and Teen books." */
  ageGroup: string;
  hideMature: boolean;
  hiddenWarnings: string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateContentPrefsAction, {});
  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />
      <div>
        <p className="text-sm font-semibold">Date of birth</p>
        <p className="mt-1 text-sm">{birthDate ? formatBirthDate(birthDate) : "Not set"}</p>
        <p className="mt-1 text-sm text-ink-soft">Age group: {ageGroup}</p>
        <p className="mt-1 text-xs text-ink-soft">
          Decides whether you can see Mature books. Never shown to anyone. It can’t be changed here: if it’s wrong,{" "}
          <Link href="/messages" className="font-semibold text-accent hover:underline">
            message the admin
          </Link>
          .
        </p>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="hideMature" defaultChecked={hideMature} className="mt-1 accent-[var(--accent)]" />
        <span>
          <span className="font-semibold">Hide Mature books from my feeds</span>
          <span className="block text-ink-soft">They won’t appear on the homepage, in search, or on fandom and tag pages.</span>
        </span>
      </label>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Hide books with these warnings from my feeds</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {WARNINGS.map((w) => (
            <label key={w} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="hiddenWarnings" value={w} defaultChecked={hiddenWarnings.includes(w)} className="accent-[var(--accent)]" />
              {w}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Save
        </Button>
        {state.values?.saved && !pending && (
          <span role="status" className="text-sm font-semibold text-success">
            ✓ Saved
          </span>
        )}
      </div>
    </form>
  );
}

/** The people this user blocked, each with an Unblock button. */
export function BlockedList({ users }: { users: { username: string; image: string | null }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (users.length === 0) return <p className="text-sm text-ink-soft">You haven’t blocked anyone.</p>;
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {users.map((u) => (
        <li key={u.username} className="flex items-center gap-3 px-4 py-3">
          <Avatar src={u.image} name={u.username} size={32} />
          <Link href={`/u/${u.username}`} className="flex-1 font-semibold hover:text-accent">
            @{u.username}
          </Link>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await unblockUserAction(u.username);
                router.refresh();
              })
            }
          >
            Unblock
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Block / Unblock on a profile, with an "Are you sure?" for blocking. */
export function BlockButton({ username, blocked }: { username: string; blocked: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: typeof blockUserAction) =>
    start(async () => {
      const result = await fn(username);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });

  if (blocked) {
    return (
      <Button variant="ghost" size="sm" loading={pending} onClick={() => act(unblockUserAction)}>
        Unblock
      </Button>
    );
  }
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Block
      </Button>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() => act(blockUserAction)}
        pending={pending}
        error={error}
        confirmLabel={`Block @${username}`}
      >
        <p className="text-sm text-ink-soft">
          @{username} won’t be able to comment on your books, and you won’t see their books or comments. You’ll also stop following each other. You can
          unblock them any time in settings.
        </p>
      </ConfirmDialog>
    </>
  );
}
