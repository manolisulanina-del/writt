"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** "center" for dialogs, "side" for the slide-over panel. */
  placement?: "center" | "side";
  className?: string;
};

/** Native <dialog>: focus trap, Esc to close and inert background come for free. */
export function Modal({ open, onClose, title, description, children, placement = "center", className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
      aria-labelledby={titleId}
      className={cn(
        "bg-surface text-ink shadow-lift backdrop:bg-black/45 backdrop:backdrop-blur-[2px]",
        placement === "center"
          ? "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line p-0"
          : "my-0 mr-0 ml-auto h-dvh max-h-dvh w-full max-w-md border-l border-line p-0 sm:rounded-l-2xl",
        className,
      )}
    >
      {open && (
        <div className={cn("flex flex-col", placement === "side" && "h-full")}>
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id={titleId} className="font-display text-xl font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-m-1 rounded-lg p-1.5 text-ink-soft hover:bg-muted hover:text-ink"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
