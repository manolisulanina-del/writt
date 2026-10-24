"use client";

import { useActionState } from "react";
import { recoveryAction, type RecoveryState } from "@/actions/auth";
import { Button, LinkButton } from "@/components/ui/Button";
import { Field, FormError, Input } from "@/components/ui/Field";
import { PasswordInput } from "./PasswordInput";

export function RecoveryForm() {
  const [state, action, pending] = useActionState<RecoveryState, FormData>(recoveryAction, { step: "identify" });

  if (state.step === "done") {
    return (
      <div role="status" className="space-y-5 rounded-2xl border border-line bg-surface p-6">
        <p className="font-semibold">Your password has been updated.</p>
        <LinkButton href="/login?reset=1" size="lg" className="w-full">
          Log in
        </LinkButton>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      {state.step === "identify" ? (
        <Field label="Email or username" errors={state.fieldErrors?.identifier}>
          {(p) => (
            <Input {...p} name="identifier" autoComplete="username" defaultValue={state.values?.identifier} required autoFocus />
          )}
        </Field>
      ) : (
        <>
          <input type="hidden" name="identifier" value={state.identifier} />
          <div className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Your security question</p>
            <p className="mt-1 font-read text-lg">{state.question}</p>
          </div>
          <Field label="Answer" hint="Not case-sensitive." errors={state.fieldErrors?.answer}>
            {(p) => <Input {...p} name="answer" autoComplete="off" required autoFocus />}
          </Field>
          <Field label="New password" errors={state.fieldErrors?.password}>
            {(p) => <PasswordInput {...p} name="password" autoComplete="new-password" showStrength required />}
          </Field>
          <Field label="Confirm new password" errors={state.fieldErrors?.confirmPassword}>
            {(p) => <PasswordInput {...p} name="confirmPassword" autoComplete="new-password" required />}
          </Field>
        </>
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {state.step === "identify" ? "Continue" : "Set new password"}
      </Button>
    </form>
  );
}
