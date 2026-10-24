"use client";

import { useActionState, useState, useTransition } from "react";
import type { FormState } from "@/actions/auth";
import {
  createFamilyAccountAction,
  decideConsentAction,
  enterConsentCodeAction,
  requestFamilyLoginAction,
  requestParentConsentAction,
  resendConsentAction,
  signInWithFamilyLinkAction,
} from "@/actions/consent";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, FormError, Input } from "@/components/ui/Field";

/** The child enters a parent's email or phone number. */
export function ParentContactForm({ submitLabel = "Send to my parent", phoneAllowed }: { submitLabel?: string; phoneAllowed: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestParentConsentAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Field
        label={phoneAllowed ? "Your parent’s email or phone number" : "Your parent’s email address"}
        hint={
          phoneAllowed
            ? "For a phone number, include the country code, like +1 202 555 0143. We never show it to anyone."
            : "We never show it to anyone."
        }
        errors={state.fieldErrors?.contact}
      >
        {(p) => <Input {...p} type={phoneAllowed ? "text" : "email"} name="contact" defaultValue={state.values?.contact} autoComplete="off" required />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

export function ResendButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await resendConsentAction();
            setMessage("error" in result ? { ok: false, text: result.error } : { ok: true, text: "Sent again. Ask your parent to check their messages." });
          })
        }
      >
        Resend
      </Button>
      {message && (
        <p role="status" className={message.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
          {message.text}
        </p>
      )}
    </div>
  );
}

/** A parent without an account makes a family account (email only, no password). */
export function FamilyAccountForm({ token, defaultEmail }: { token: string; defaultEmail: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createFamilyAccountAction.bind(null, token), {});
  if (state.values?.sent) {
    return (
      <p role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">
        We sent a sign-in link to {state.values.email}. Open it to continue approving.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Field label="Your email" hint="Your family account has no password: we email you a link whenever you sign in." errors={state.fieldErrors?.email}>
        {(p) => <Input {...p} type="email" name="email" autoComplete="email" defaultValue={state.values?.email ?? defaultEmail} required />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Create my free family account
      </Button>
    </form>
  );
}

/** "I am this child's parent or guardian" + Approve, or Decline (which deletes the child's account). */
export function ConsentDecisionForm({ token, username, agreement }: { token: string; username: string; agreement: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(decideConsentAction.bind(null, token), {});
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [declining, startDecline] = useTransition();
  return (
    <>
      <form action={action} className="space-y-4">
        <FormError message={state.error} />
        <label className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
          <input type="checkbox" name="agree" className="mt-0.5 size-4 accent-[var(--accent)]" required />
          <span className="font-semibold">{agreement}</span>
        </label>
        {state.fieldErrors?.agree && <p className="text-sm font-medium text-danger">{state.fieldErrors.agree[0]}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" name="decision" value="approve" size="lg" className="flex-1" loading={pending}>
            Approve
          </Button>
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setConfirmDecline(true)} disabled={pending}>
            Decline
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDecline}
        onCancel={() => setConfirmDecline(false)}
        title={`Decline @${username}’s account?`}
        confirmLabel="Decline and delete"
        pending={declining}
        onConfirm={() =>
          startDecline(async () => {
            const form = new FormData();
            form.set("decision", "decline");
            await decideConsentAction(token, {}, form);
          })
        }
      >
        <p className="text-sm text-ink-soft">Their account and everything in it will be deleted right away.</p>
      </ConfirmDialog>
    </>
  );
}

/** For parents who got a text: the child's username and the 6-digit code. */
export function ConsentCodeForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(enterConsentCodeAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Field label="Your child’s username" errors={state.fieldErrors?.username}>
        {(p) => <Input {...p} name="username" autoCapitalize="none" defaultValue={state.values?.username} required />}
      </Field>
      <Field label="6-digit code" errors={state.fieldErrors?.code}>
        {(p) => <Input {...p} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} defaultValue={state.values?.code} required />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Continue
      </Button>
    </form>
  );
}

export function FamilyLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestFamilyLoginAction, {});
  if (state.values?.sent) {
    return (
      <p role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">
        If there’s a family account for {state.values.email}, we just sent it a sign-in link. It works once and expires in 30 minutes.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <input type="hidden" name="next" value={next} />
      <Field label="Email" errors={state.fieldErrors?.email}>
        {(p) => <Input {...p} type="email" name="email" autoComplete="email" defaultValue={state.values?.email} required />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Email me a sign-in link
      </Button>
    </form>
  );
}

export function UseLoginLinkButton({ token, next }: { token: string; next: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="lg" className="w-full" loading={pending} onClick={() => start(() => signInWithFamilyLinkAction(token, next))}>
      Sign in
    </Button>
  );
}
