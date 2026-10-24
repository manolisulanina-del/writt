"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { checkUsernameAction } from "@/actions/onboarding";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/Field";

/** Username field with a debounced availability check. */
export function UsernameInput({ defaultValue = "", className, ...props }: ComponentProps<"input"> & { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  // Each result remembers which value it was checked for, so stale results never show.
  const [checked, setChecked] = useState<{ value: string; ok: boolean; message?: string } | null>(null);
  const status = checked?.value === value && value.length >= 3 ? checked : null;

  useEffect(() => {
    if (value.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await checkUsernameAction(value);
        if (!cancelled) setChecked({ value, ...result });
      } catch {
        // The page moved on (e.g. onboarding finished) before the check returned.
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-soft">@</span>
        <input
          {...props}
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          className={cn(inputClass, "pl-8", className)}
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <p aria-live="polite" className={cn("text-xs", status?.ok ? "text-success" : "text-danger")}>
        {status && (status.ok ? "✓ Available" : status.message)}
      </p>
    </div>
  );
}
