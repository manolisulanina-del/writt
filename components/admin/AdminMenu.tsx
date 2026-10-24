"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { runAdminCommandAction } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Textarea } from "@/components/ui/Field";
import { cn } from "@/lib/utils";

export type AdminField = { name: string; label: string; placeholder?: string; required?: boolean; multiline?: boolean };

export type AdminItem =
  | { label: string; href: string }
  | {
      label: string;
      /** Builds the command from the prompt's field values. */
      command: (values: Record<string, string>) => string;
      fields?: AdminField[];
      destructive?: boolean;
      /** Extra line in the confirmation popup. */
      note?: string;
    };

type ActionItem = Exclude<AdminItem, { href: string }>;

/** The admin's per-item menu on books, comments and profiles. Runs the same commands as the command box. */
export function AdminMenu({
  items,
  label = "Admin",
  align = "left",
  onSuccess,
}: {
  items: AdminItem[];
  label?: string;
  align?: "left" | "right";
  /** Called with the item's label after its command succeeds. */
  onSuccess?: (label: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ActionItem | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function run(item: ActionItem, vals: Record<string, string>) {
    start(async () => {
      const result = await runAdminCommandAction(item.command(vals), item.destructive === true);
      if (!result.ok) {
        if (active) setError(result.message);
        else setToast(result.message);
        return;
      }
      setActive(null);
      setToast(result.message);
      onSuccess?.(item.label);
      router.refresh();
    });
  }

  function choose(item: ActionItem) {
    setOpen(false);
    setError(null);
    setValues({});
    if (item.fields?.length || item.destructive) setActive(item);
    else run(item, {});
  }

  return (
    <div ref={wrapper} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-ink/80 bg-ink px-2.5 text-xs font-bold tracking-wide text-paper uppercase hover:opacity-90"
      >
        {label} ▾
      </button>
      {open && (
        <ul
          id={menuId}
          className={cn(
            "absolute z-40 mt-1.5 max-h-80 w-56 overflow-y-auto rounded-xl border border-line bg-surface p-1 text-sm shadow-lift",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => (
            <li key={item.label}>
              {"href" in item ? (
                <Link href={item.href} className="block rounded-lg px-3 py-2 hover:bg-muted" onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => choose(item)}
                  className={cn("block w-full rounded-lg px-3 py-2 text-left hover:bg-muted", item.destructive && "text-danger")}
                >
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {toast && (
        <p role="status" className="absolute z-40 mt-1.5 w-max max-w-72 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-paper shadow-lift">
          {toast}
          <button type="button" className="ml-2 opacity-70 hover:opacity-100" onClick={() => setToast(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      <ConfirmDialog
        open={active !== null}
        title={active?.destructive ? "Are you sure?" : (active?.label ?? "")}
        confirmLabel={active?.destructive ? `Yes, ${active.label.toLowerCase()}` : active?.label}
        danger={active?.destructive}
        pending={pending}
        error={error}
        onCancel={() => setActive(null)}
        onConfirm={() => {
          if (!active) return;
          const missing = active.fields?.find((f) => f.required && !values[f.name]?.trim());
          if (missing) {
            setError(`${missing.label} is required.`);
            return;
          }
          run(active, values);
        }}
      >
        {active?.note && <p className="text-sm text-ink-soft">{active.note}</p>}
        {active?.fields?.map((f) => (
          <label key={f.name} className="block space-y-1.5">
            <span className="text-sm font-semibold">
              {f.label}
              {!f.required && <span className="font-normal text-ink-soft"> (optional)</span>}
            </span>
            {f.multiline ? (
              <Textarea
                value={values[f.name] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                maxLength={1000}
              />
            ) : (
              <Input
                value={values[f.name] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            )}
          </label>
        ))}
      </ConfirmDialog>
    </div>
  );
}
