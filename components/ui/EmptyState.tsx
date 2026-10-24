import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      <svg viewBox="0 0 64 64" className="mb-4 size-14 text-ink-soft/50" fill="none" aria-hidden>
        <path d="M14 10h26l10 10v34H14z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M40 10v10h10M22 32h20M22 40h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="48" cy="50" r="5" fill="var(--accent)" />
      </svg>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-soft">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className ?? ""}`} aria-hidden />;
}
