"use client";

import { useActionState, useState } from "react";
import { signupAction, type FormState } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input } from "@/components/ui/Field";
import { PasswordInput } from "./PasswordInput";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signupAction, {});
  const [email, setEmail] = useState("");

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Field
        label="Date of birth"
        hint="You need to be 7 or older. Under 16, a parent approves your account. Never shown to anyone, and can’t be changed later."
        errors={state.fieldErrors?.birthDate}
      >
        {/* No `max`: this page is prerendered, so "today" would be stale. The server rejects future dates. */}
        {(p) => <Input {...p} type="date" name="birthDate" defaultValue={state.values?.birthDate} required />}
      </Field>
      <Field label="Email" errors={state.fieldErrors?.email}>
        {(p) => (
          <Input
            {...p}
            type="email"
            name="email"
            autoComplete="email"
            defaultValue={state.values?.email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}
      </Field>
      <Field label="Password" errors={state.fieldErrors?.password}>
        {(p) => (
          <PasswordInput {...p} name="password" autoComplete="new-password" showStrength context={[email]} required />
        )}
      </Field>
      <Field label="Confirm password" errors={state.fieldErrors?.confirmPassword}>
        {(p) => <PasswordInput {...p} name="confirmPassword" autoComplete="new-password" required />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Create account
      </Button>
    </form>
  );
}
