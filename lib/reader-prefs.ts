// Reader display settings, saved per user (User.readerPrefs) and applied on the reading page.

export type ReaderPrefs = {
  size: "s" | "m" | "l" | "xl";
  spacing: "tight" | "normal" | "loose";
  font: "serif" | "sans" | "dyslexic";
  theme: "auto" | "light" | "dark" | "sepia";
};

export const DEFAULT_READER_PREFS: ReaderPrefs = { size: "m", spacing: "normal", font: "serif", theme: "auto" };

export const READER_OPTIONS = {
  size: [
    { value: "s", label: "Small", css: "1rem" },
    { value: "m", label: "Medium", css: "1.125rem" },
    { value: "l", label: "Large", css: "1.3rem" },
    { value: "xl", label: "Extra large", css: "1.5rem" },
  ],
  spacing: [
    { value: "tight", label: "Tight", css: "1.55" },
    { value: "normal", label: "Normal", css: "1.8" },
    { value: "loose", label: "Loose", css: "2.15" },
  ],
  font: [
    { value: "serif", label: "Literata (serif)", css: "var(--font-read)" },
    { value: "sans", label: "Instrument Sans", css: "var(--font-ui)" },
    { value: "dyslexic", label: "Lexend (dyslexia-friendly)", css: "var(--font-dyslexic)" },
  ],
  theme: [
    { value: "auto", label: "Match site" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "sepia", label: "Sepia" },
  ],
} as const;

export function parseReaderPrefs(value: unknown): ReaderPrefs {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const pick = <K extends keyof ReaderPrefs>(key: K): ReaderPrefs[K] =>
    (READER_OPTIONS[key] as readonly { value: string }[]).some((o) => o.value === v[key]) ? (v[key] as ReaderPrefs[K]) : DEFAULT_READER_PREFS[key];
  return { size: pick("size"), spacing: pick("spacing"), font: pick("font"), theme: pick("theme") };
}

/** CSS custom properties consumed by .reader-surface in globals.css. */
export function readerStyle(prefs: ReaderPrefs): Record<string, string> {
  const css = (key: "size" | "spacing" | "font") =>
    (READER_OPTIONS[key] as readonly { value: string; css: string }[]).find((o) => o.value === prefs[key])!.css;
  return { "--reader-size": css("size"), "--reader-leading": css("spacing"), "--reader-font": css("font") };
}
