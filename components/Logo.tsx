import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark: italic serif "Writt" with an ink-drop dot. */
export function Logo({ className, href = "/" }: { className?: string; href?: string | null }) {
  const mark = (
    <span className={cn("inline-flex items-baseline font-display text-2xl font-semibold tracking-tight italic", className)}>
      Writt
      <span className="ml-0.5 inline-block size-[0.32em] rounded-full bg-accent" aria-hidden />
    </span>
  );
  if (!href) return mark;
  return (
    <Link href={href} aria-label="Writt home" className="rounded-md">
      {mark}
    </Link>
  );
}
