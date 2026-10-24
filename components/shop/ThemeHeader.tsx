import { Timecode } from "./Timecode";

/** Decorations at the top of a themed homepage. Purely visual, hidden from screen readers. */
export function ThemeHeader({ theme }: { theme: string }) {
  if (theme === "pastel") {
    return (
      <div aria-hidden className="mb-4 flex items-center gap-3 text-2xl">
        <span className="text-[#f48fb1]">♡</span>
        <span className="text-[#b39ddb]">✿</span>
        <span className="text-[#80cbc4]">☁</span>
        <span className="text-[#f48fb1]">✦</span>
        <span className="text-[#b39ddb]">♡</span>
      </div>
    );
  }
  if (theme === "emo") {
    return (
      <div aria-hidden className="mb-4 flex items-center gap-3">
        <span className="h-1 w-24 bg-accent [clip-path:polygon(0_40%,8%_0,20%_60%,33%_10%,47%_70%,60%_20%,74%_80%,88%_10%,100%_50%,100%_100%,0_100%)]" />
        <span className="font-mono text-sm tracking-[0.4em] text-ink-soft">✕ ✕ ✕</span>
      </div>
    );
  }
  if (theme === "analog-horror") {
    return (
      <div aria-hidden className="vhs-osd mb-6 flex items-center justify-between text-xl sm:text-2xl">
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full bg-[#d9483b]" /> REC
        </span>
        <span>
          PLAY ▶ <Timecode />
        </span>
        <span className="hidden sm:inline">OCT. 23 1998</span>
      </div>
    );
  }
  return null;
}
