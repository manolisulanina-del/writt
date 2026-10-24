"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, resetPasswordAction, type FormState } from "@/actions/auth";
import { Button, LinkButton } from "@/components/ui/Button";
import { Field, FormError, Input } from "@/components/ui/Field";
import { PasswordInput } from "./PasswordInput";

/** "Email me a reset link": the same answer whether or not the account exists. */
export function EmailResetForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordResetAction, {});
  if (state.values?.sent) {
    return (
      <p role="status" className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
        If there’s an account for “{state.values.identifier}”, we’ve emailed it a link to choose a new password. It works once and expires in 1 hour.
        Check your spam folder too.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Field label="Email or username" errors={state.fieldErrors?.identifier}>
        {(p) => <Input {...p} name="identifier" autoComplete="username" defaultValue={state.values?.identifier} required autoFocus />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Email me a reset link
      </Button>
    </form>
  );
}

/** The page the emailed link opens: choose a new password. */
export function NewPasswordForm({ token, context }: { token: string; context: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction.bind(null, token), {});
  if (state.values?.done) {
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
      <Field label="New password" errors={state.fieldErrors?.password}>
        {(p) => (
          <PasswordInput
            {...p}
            name="password"
            autoComplete="new-password"
            showStrength
            context={context}
            required
            autoFocus
          />
        )}
      </Field>
      <Field label="Confirm new password" errors={state.fieldErrors?.confirmPassword}>
        {(p) => <PasswordInput {...p} name="confirmPassword" autoComplete="new-password" required />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Set new password
      </Button>
    </form>
  );
}
