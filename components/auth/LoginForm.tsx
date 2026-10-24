"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input } from "@/components/ui/Field";
import { PasswordInput } from "./PasswordInput";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-4" noValidate>
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      <FormError message={state.error} />
      <Field label="Email or username" errors={state.fieldErrors?.identifier}>
        {(p) => (
          <Input
            {...p}
            name="identifier"
            autoComplete="username"
            defaultValue={state.values?.identifier}
            required
            autoFocus
          />
        )}
      </Field>
      <Field label="Password" errors={state.fieldErrors?.password}>
        {(p) => <PasswordInput {...p} name="password" autoComplete="current-password" required />}
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-semibold text-ink-soft hover:text-accent">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Log in
      </Button>
    </form>
  );
}
