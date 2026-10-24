import Image from "next/image";
import { cn } from "@/lib/utils";

const TINTS = ["bg-accent-soft text-accent", "bg-plum-soft text-plum", "bg-muted text-ink"];

export function Avatar({
  src,
  name,
  size = 36,
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (src) {
    return (
      <Image
        src={src}
        alt={`${name}’s avatar`}
        width={size}
        height={size}
        unoptimized
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-line", className)}
        style={style}
      />
    );
  }
  const tint = TINTS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % TINTS.length];
  return (
    <span
      role="img"
      aria-label={`${name}’s avatar`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold ring-1 ring-line",
        tint,
        className,
      )}
      style={{ ...style, fontSize: size * 0.42 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
