"use client";

import { useState, type ComponentProps } from "react";
import { checkPasswordStrength } from "@/lib/password-strength";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/Field";

type Props = ComponentProps<"input"> & { showStrength?: boolean; context?: string[] };

const BAR = ["bg-danger", "bg-danger", "bg-[#d99a2b]", "bg-success", "bg-success"];

export function PasswordInput({ showStrength, context = [], className, onChange, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const strength = checkPasswordStrength(value, context);

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          {...props}
          type={visible ? "text" : "password"}
          value={value}
          className={cn(inputClass, "pr-16", className)}
          onChange={(e) => {
            setValue(e.target.value);
            onChange?.(e);
          }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-1 right-1 rounded-lg px-2.5 text-xs font-semibold text-ink-soft hover:bg-muted hover:text-ink"
          aria-pressed={visible}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {showStrength && value.length > 0 && (
        <div aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cn("h-1.5 flex-1 rounded-full transition", strength.score >= i ? BAR[strength.score] : "bg-muted")}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Strength: <strong className="text-ink">{strength.label}</strong>
            {strength.problems[0] && <> · {strength.problems[0]}</>}
          </p>
        </div>
      )}
    </div>
  );
}
