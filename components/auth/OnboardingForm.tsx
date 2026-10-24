"use client";

import { useActionState, useState } from "react";
import { completeSetupAction } from "@/actions/onboarding";
import type { FormState } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { Badge, Field, FormError, Input } from "@/components/ui/Field";
import { needsConsent } from "@/lib/kids";
import { todayIso } from "@/lib/utils";
import { PasswordInput } from "./PasswordInput";
import { SecurityQuestionFields } from "./SecurityQuestionFields";
import { UsernameInput } from "./UsernameInput";

export function OnboardingForm({
  needsPassword,
  needsBirthDate,
  isKid,
  email,
  suggestedUsername,
}: {
  needsPassword: boolean;
  /** False when it was given at sign-up. */
  needsBirthDate: boolean;
  /** Under 16 (known from sign-up): no phone number field. */
  isKid: boolean;
  email: string;
  suggestedUsername: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(completeSetupAction, {});
  const [username, setUsername] = useState(suggestedUsername);
  const [birthDate, setBirthDate] = useState(state.values?.birthDate ?? "");
  // Kids (under 16) don't get a phone number field; the server ignores one anyway.
  const showPhone = needsBirthDate ? !birthDate || !needsConsent(new Date(`${birthDate}T00:00:00Z`)) : !isKid;
  const errors = state.fieldErrors;

  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError message={state.error} />
      <Field
        label="Username"
        hint="3–20 characters: letters, numbers, underscores, dots."
        badge={<Badge tone="accent">Required</Badge>}
        errors={errors?.username}
      >
        {(p) => (
          <UsernameInput
            {...p}
            key={state.values?.username}
            name="username"
            defaultValue={state.values?.username ?? suggestedUsername}
            onInput={(e) => setUsername(e.currentTarget.value)}
            autoComplete="username"
            required
            autoFocus
          />
        )}
      </Field>

      {needsPassword && (
        <>
          <Field
            label="Password"
            hint="You’ll use it with your email or username to log in."
            badge={<Badge tone="accent">Required</Badge>}
            errors={errors?.password}
          >
            {(p) => (
              <PasswordInput {...p} name="password" autoComplete="new-password" showStrength context={[username, email]} required />
            )}
          </Field>
          <Field label="Confirm password" errors={errors?.confirmPassword}>
            {(p) => <PasswordInput {...p} name="confirmPassword" autoComplete="new-password" required />}
          </Field>
        </>
      )}

      {needsBirthDate && (
        <Field
          label="Date of birth"
          badge={<Badge tone="accent">Required</Badge>}
          hint="Used only to decide whether you can see Mature books. Never shown to anyone, and can’t be changed later."
          errors={errors?.birthDate}
        >
          {(p) => (
            <Input
              {...p}
              type="date"
              name="birthDate"
              defaultValue={state.values?.birthDate}
              max={todayIso()}
              onChange={(e) => setBirthDate(e.target.value)}
              required
            />
          )}
        </Field>
      )}

      {showPhone && (
        <Field label="Phone number" badge={<Badge>Optional</Badge>} hint="Include your country code, e.g. +1 202 555 0143." errors={errors?.phone}>
          {(p) => <Input {...p} type="tel" name="phone" autoComplete="tel" defaultValue={state.values?.phone} />}
        </Field>
      )}

      <SecurityQuestionFields errors={errors} defaultQuestion={state.values?.securityQuestion} />

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Continue to Writt
      </Button>
    </form>
  );
}
