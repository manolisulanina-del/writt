import { cn } from "@/lib/utils";
import { DEFAULT_THEME } from "@/lib/themes";

/** A small picture of the homepage in a theme, drawn with the theme's own CSS. */
export function ThemePreview({ theme, locked, className }: { theme: string; locked?: boolean; className?: string }) {
  if (locked) {
    return (
      <div aria-hidden className={cn("flex aspect-[16/10] items-center justify-center rounded-xl bg-muted text-4xl", className)}>
        🔒
      </div>
    );
  }
  return (
    <div aria-hidden className={cn("relative aspect-[16/10] overflow-hidden rounded-xl border border-line", className)}>
      <div data-home-theme={theme === DEFAULT_THEME ? undefined : theme} className="absolute inset-0 bg-paper p-3 text-ink">
        {theme === "analog-horror" && <div className="vhs-osd mb-1 flex justify-between text-[11px]">REC ● <span>03:14 AM</span></div>}
        <h2 className="font-display text-base leading-tight font-semibold">What will you read tonight?</h2>
        <div className="mt-2 h-4 w-3/4 rounded-xl border border-line bg-surface" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1">
              <div className={cn("aspect-[2/3] rounded-xl", i === 0 ? "bg-accent" : i === 1 ? "bg-plum" : "bg-muted")} />
              <div className="h-1.5 w-4/5 rounded-full bg-ink/70" />
              <div className="h-1.5 w-1/2 rounded-full bg-ink-soft/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
