"use client";

import { useActionState } from "react";
import { confirmBirthDateAction } from "@/actions/onboarding";
import type { FormState } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input } from "@/components/ui/Field";
import { todayIso } from "@/lib/utils";

export function BirthDateForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmBirthDateAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError message={state.error} />
      <Field
        label="Date of birth"
        hint="Used only to decide whether you can see Mature books. Never shown to anyone, and can’t be changed later."
        errors={state.fieldErrors?.birthDate}
      >
        {(p) => <Input {...p} type="date" name="birthDate" defaultValue={state.values?.birthDate} max={todayIso()} required />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Continue
      </Button>
    </form>
  );
}
