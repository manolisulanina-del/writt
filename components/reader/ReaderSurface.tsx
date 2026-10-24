"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { saveReaderPrefsAction } from "@/actions/preferences";
import { READER_OPTIONS, readerStyle, type ReaderPrefs } from "@/lib/reader-prefs";
import { cn } from "@/lib/utils";

/** The reading column, styled by the reader's saved font, size, spacing and background, with a settings popover. */
export function ReaderSurface({ initial, children }: { initial: ReaderPrefs; children: ReactNode }) {
  const [prefs, setPrefs] = useState(initial);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null);

  // Save a moment after the last change.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void saveReaderPrefsAction(prefs), 600);
    return () => clearTimeout(timer);
  }, [prefs, dirty]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function set<K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
    setDirty(true);
  }

  return (
    <div
      className={cn("reader-surface relative", prefs.theme !== "auto" && "rounded-2xl px-5 py-8 sm:px-10")}
      data-reader-theme={prefs.theme}
      style={readerStyle(prefs) as React.CSSProperties}
    >
      <div ref={wrapper} className="absolute -top-2 right-0 z-20 sm:right-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 font-display text-sm font-semibold text-ink shadow-card hover:bg-muted"
          aria-label="Reading settings"
          title="Reading settings"
        >
          Aa
        </button>
        {open && (
          <div id={panelId} role="dialog" aria-label="Reading settings" className="absolute right-0 mt-2 w-72 space-y-4 rounded-2xl border border-line bg-surface p-4 font-sans text-ink shadow-lift">
            {(["size", "spacing", "font", "theme"] as const).map((key) => (
              <fieldset key={key}>
                <legend className="mb-1.5 text-xs font-bold tracking-widest text-ink-soft uppercase">
                  {{ size: "Text size", spacing: "Line spacing", font: "Font", theme: "Background" }[key]}
                </legend>
                <div className={cn("grid gap-1", key === "font" ? "grid-cols-1" : key === "spacing" ? "grid-cols-3" : "grid-cols-4")}>
                  {READER_OPTIONS[key].map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set(key, o.value as never)}
                      aria-pressed={prefs[key] === o.value}
                      aria-label={key === "size" ? o.label : undefined}
                      title={key === "size" ? o.label : undefined}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-xs font-semibold",
                        prefs[key] === o.value ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-muted",
                      )}
                      style={key === "font" ? { fontFamily: (o as { css: string }).css } : undefined}
                    >
                      {key === "size" ? <span style={{ fontSize: (o as { css: string }).css }}>A</span> : o.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
            <p className="text-xs text-ink-soft">Saved to your account for every book.</p>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
