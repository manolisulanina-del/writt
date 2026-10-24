import Image from "next/image";
import { cn } from "@/lib/utils";

const PALETTES = [
  ["#3d2f63", "#f6f1e7"],
  ["#d2452a", "#fffaf5"],
  ["#1f4d45", "#eef6ef"],
  ["#2b3a67", "#f1ecff"],
  ["#7a3b2e", "#fbeee6"],
  ["#1d1a16", "#f6f1e7"],
];

/** Story cover, or a typeset placeholder in the house style when there's no image. */
export function Cover({
  src,
  title,
  className,
  sizes = "(min-width: 1024px) 16rem, 45vw",
  priority,
}: {
  src?: string | null;
  title: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (src) {
    return (
      <div className={cn("relative aspect-[2/3] overflow-hidden rounded-xl bg-muted", className)}>
        <Image src={src} alt={`Cover of ${title}`} fill sizes={sizes} unoptimized priority={priority} className="object-cover" />
      </div>
    );
  }
  const [bg, fg] = PALETTES[[...title].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTES.length];
  return (
    <div
      role="img"
      aria-label={`Cover of ${title}`}
      className={cn("relative flex aspect-[2/3] flex-col justify-between overflow-hidden rounded-xl p-4", className)}
      style={{ background: bg, color: fg }}
    >
      <span className="h-px w-8 bg-current opacity-60" />
      <span className="line-clamp-5 font-display text-xl leading-tight font-semibold break-words">{title}</span>
      <span className="font-display text-xs tracking-[0.3em] uppercase italic opacity-70">Writt</span>
      <span className="absolute -right-6 -bottom-6 size-20 rounded-full bg-current opacity-10" aria-hidden />
    </div>
  );
}
