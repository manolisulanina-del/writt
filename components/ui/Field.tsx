import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-soft/60 transition focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 aria-invalid:border-danger";

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  errors?: string[];
  badge?: ReactNode;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
};

/** Label + control + hint + errors, wired for screen readers. */
export function Field({ label, hint, errors, badge, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-ink">
        {label}
        {badge}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": errorId ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-xs text-ink-soft">
          {hint}
        </p>
      )}
      {errorId && (
        <ul id={errorId} className="space-y-0.5 text-xs font-medium text-danger">
          {errors!.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "min-h-24 resize-y", className)} {...props} />;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
      {message}
    </p>
  );
}

export function Badge({ children, tone = "plum" }: { children: ReactNode; tone?: "plum" | "accent" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase",
        tone === "plum" ? "bg-plum-soft text-plum" : "bg-accent-soft text-accent",
      )}
    >
      {children}
    </span>
  );
}
