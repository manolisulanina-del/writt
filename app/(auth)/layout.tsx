import { Logo } from "@/components/Logo";

const LINES = [
  "“The ship sailed at dawn, and so did we.”",
  "Chapter 12: In which nobody is okay.",
  "Every canon deserves a second draft.",
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-plum text-[#f6f1e7] lg:flex lg:flex-col lg:justify-between lg:p-12 dark:bg-plum-soft dark:text-ink">
        <Logo href={null} className="text-3xl" />
        <div className="relative z-10 max-w-md space-y-6">
          <p className="font-display text-5xl leading-[1.05] font-semibold">
            Write the story canon <em className="text-accent-soft dark:text-accent">forgot</em> to tell.
          </p>
          <ul className="space-y-2 font-read text-lg italic opacity-80">
            {LINES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-sm opacity-70">Fanfiction, written by everyone, for everyone.</p>
        {/* Decorative manuscript lines */}
        <svg className="absolute -right-24 -bottom-24 size-[28rem] opacity-15" viewBox="0 0 200 200" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <line key={i} x1="10" x2={190 - (i % 3) * 30} y1={20 + i * 12} y2={20 + i * 12} stroke="currentColor" strokeWidth="2" />
          ))}
          <circle cx="160" cy="160" r="22" fill="var(--accent)" />
        </svg>
      </aside>
      <main className="flex flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div className="mb-8 lg:hidden">
          <Logo href={null} className="text-4xl" />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
