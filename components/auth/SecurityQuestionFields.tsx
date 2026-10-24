"use client";

import { useState } from "react";
import { SECURITY_QUESTIONS } from "@/lib/validation";
import { Badge, Field, Input, inputClass } from "@/components/ui/Field";
import type { FieldErrors } from "@/lib/validation";

const CUSTOM = "__custom__";

/** Preset or custom security question plus its answer. */
export function SecurityQuestionFields({
  errors,
  defaultQuestion = "",
  answerHint,
}: {
  errors?: FieldErrors;
  defaultQuestion?: string;
  answerHint?: string;
}) {
  const isPreset = (SECURITY_QUESTIONS as readonly string[]).includes(defaultQuestion);
  const [choice, setChoice] = useState(defaultQuestion === "" ? "" : isPreset ? defaultQuestion : CUSTOM);
  const [custom, setCustom] = useState(isPreset ? "" : defaultQuestion);
  const question = choice === CUSTOM ? custom : choice;

  return (
    <fieldset className="space-y-4 rounded-2xl border border-line bg-surface/60 p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
        Account recovery <Badge>Recommended</Badge>
      </legend>
      <p className="-mt-1 text-xs text-ink-soft">
        If you forget your password, answering this question is how you get back in.
      </p>
      <input type="hidden" name="securityQuestion" value={question} />
      <Field label="Security question" errors={errors?.securityQuestion}>
        {(p) => (
          <select {...p} className={inputClass} value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">No security question</option>
            {SECURITY_QUESTIONS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
            <option value={CUSTOM}>Write my own…</option>
          </select>
        )}
      </Field>
      {choice === CUSTOM && (
        <Field label="Your question">
          {(p) => <Input {...p} value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={200} />}
        </Field>
      )}
      {choice !== "" && (
        <Field label="Answer" hint={answerHint ?? "Stored hashed, like a password. Not case-sensitive."} errors={errors?.securityAnswer}>
          {(p) => <Input {...p} name="securityAnswer" autoComplete="off" maxLength={200} />}
        </Field>
      )}
    </fieldset>
  );
}
