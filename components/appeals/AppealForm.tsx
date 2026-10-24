"use client";

import { useActionState, useState } from "react";
import { createAppealAction } from "@/actions/appeals";
import type { FormState } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input, Textarea, inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/utils";

export function AppealForm({ prefill }: { prefill: { link: string; title: string; own: boolean } | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAppealAction, {});
  const [message, setMessage] = useState(state.values?.message ?? "");

  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError message={state.error} />
      <Field label="What’s this about?">
        {(p) => (
          <select {...p} name="topic" className={inputClass} defaultValue="removed">
            <option value="removed">A book was removed unfairly</option>
          </select>
        )}
      </Field>

      {prefill ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <input type="hidden" name="book" value={prefill.link} />
          <p className="text-xs font-bold tracking-widest text-ink-soft uppercase">{prefill.own ? "Your removed book" : "Removed book"}</p>
          <p className="mt-0.5 font-display text-lg font-semibold">{prefill.title}</p>
        </div>
      ) : (
        <Field label="Book link or title" hint="Paste the link to the book, or type its exact title." errors={state.fieldErrors?.book}>
          {(p) => <Input {...p} name="book" defaultValue={state.values?.book} placeholder="https://…/fanfic/… or the title" required />}
        </Field>
      )}

      <Field label="Why do you think this book was removed unfairly?" errors={state.fieldErrors?.message}>
        {(p) => (
          <>
            <Textarea {...p} name="message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={6} required />
            <p className={cn("text-right text-xs", message.length > 900 ? "text-danger" : "text-ink-soft")}>{message.length}/1000</p>
          </>
        )}
      </Field>

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Send
      </Button>
    </form>
  );
}
