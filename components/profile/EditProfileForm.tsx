"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/actions/profile";
import type { FormState } from "@/actions/auth";
import { SecurityQuestionFields } from "@/components/auth/SecurityQuestionFields";
import { UsernameInput } from "@/components/auth/UsernameInput";
import { Button, LinkButton } from "@/components/ui/Button";
import { Badge, Field, FormError, Input, Textarea } from "@/components/ui/Field";
import { AvatarPicker } from "./AvatarPicker";

type Profile = {
  username: string;
  nickname: string | null;
  image: string | null;
  bio: string | null;
  phone: string | null;
  securityQuestion: string | null;
};

/** `isKid`: no phone number (under 16). `simple`: a parent's "simple profile" setting, so no nickname or bio. */
export function EditProfileForm({ profile, isKid, simple }: { profile: Profile; isKid: boolean; simple: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfileAction, {});
  const v = state.values;
  const e = state.fieldErrors;

  return (
    <form action={action} className="space-y-6" noValidate>
      <FormError message={state.error} />
      {e?.image && <FormError message={e.image[0]} />}
      <AvatarPicker defaultImage={v?.image ?? profile.image} username={profile.username} />

      <Field label="Username" errors={e?.username} hint="Changing it changes your profile link.">
        {(p) => <UsernameInput {...p} key={v?.username} name="username" defaultValue={v?.username ?? profile.username} required />}
      </Field>

      {!simple && (
        <Field
          label="Nickname"
          badge={<Badge>Optional</Badge>}
          hint="Shown big on your profile. Change or clear it any time; it doesn’t have to be unique."
          errors={e?.nickname}
        >
          {(p) => (
            <Input {...p} name="nickname" maxLength={40} defaultValue={v?.nickname ?? profile.nickname ?? ""} placeholder="e.g. Mira ✦ lighthouse enjoyer" />
          )}
        </Field>
      )}

      {!simple && (
        <Field label="Bio" badge={<Badge>Optional</Badge>} errors={e?.bio}>
          {(p) => <Textarea {...p} name="bio" maxLength={500} defaultValue={v?.bio ?? profile.bio ?? ""} placeholder="Fandoms, favorite tropes, update schedule…" />}
        </Field>
      )}

      {!isKid && (
        <Field label="Phone number" badge={<Badge>Optional</Badge>} hint="Include your country code." errors={e?.phone}>
          {(p) => <Input {...p} type="tel" name="phone" autoComplete="tel" defaultValue={v?.phone ?? profile.phone ?? ""} />}
        </Field>
      )}

      <SecurityQuestionFields
        errors={e}
        defaultQuestion={v?.securityQuestion ?? profile.securityQuestion ?? ""}
        answerHint={profile.securityQuestion ? "Leave blank to keep your current answer." : undefined}
      />

      <div className="flex justify-end gap-2">
        <LinkButton href={`/u/${profile.username}`} variant="ghost">
          Cancel
        </LinkButton>
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
