"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { saveProgressAction } from "@/actions/library";
import { toggleFollowAction } from "@/actions/social";
import { Button, LinkButton } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** Follow / Following toggle for an author. */
export function FollowButton({
  username,
  initial,
  sourceFanficId,
  size = "sm",
}: {
  username: string;
  initial: boolean;
  sourceFanficId?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col">
      <Button
        size={size}
        variant={following ? "secondary" : "primary"}
        loading={pending}
        aria-pressed={following}
        onClick={() =>
          start(async () => {
            const result = await toggleFollowAction(username, sourceFanficId);
            if ("error" in result) {
              setError(result.error);
              return;
            }
            setError(null);
            setFollowing(result.following);
            router.refresh();
          })
        }
      >
        {following ? "Following" : "Follow"}
      </Button>
      {error && <span className="mt-1 text-xs text-danger">{error}</span>}
    </span>
  );
}

/** Remembers this page as the reader's place in the book. */
export function ProgressTracker({ fanficId, chapterId, pageIndex }: { fanficId: string; chapterId: string; pageIndex: number }) {
  useEffect(() => {
    const timer = setTimeout(() => void saveProgressAction(fanficId, chapterId, pageIndex), 800);
    return () => clearTimeout(timer);
  }, [fanficId, chapterId, pageIndex]);
  return null;
}

const KEY = "writt:mature-ok";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

function readAcknowledged(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}

/** "This book is rated Mature" screen before the first page. Remembered per book on this device. */
export function MatureGate({ fanficId, children }: { fanficId: string; children: ReactNode }) {
  const acknowledged = useSyncExternalStore(subscribe, () => readAcknowledged(fanficId), () => false);
  const [accepted, setAccepted] = useState(false);
  if (acknowledged || accepted) return <>{children}</>;
  return (
    <div className="flex flex-col items-center rounded-2xl border border-danger/30 bg-danger/5 px-6 py-14 text-center">
      <span className="rounded-md border border-danger/50 px-2 py-0.5 text-xs font-black tracking-widest text-danger uppercase">Mature</span>
      <h2 className="mt-4 font-display text-2xl font-semibold">This book is rated Mature</h2>
      <p className="mt-2 max-w-md text-ink-soft">It may contain content intended for adults, such as graphic violence or sexual themes. Check the warnings above before you start.</p>
      <div className="mt-6 flex gap-3">
        <Button
          onClick={() => {
            try {
              const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
              localStorage.setItem(KEY, JSON.stringify([...new Set([...list, fanficId])].slice(-500)));
            } catch {}
            setAccepted(true);
          }}
        >
          Continue to the book
        </Button>
        <LinkButton href="/" variant="secondary">
          Go back
        </LinkButton>
      </div>
    </div>
  );
}

/** Author's note box at the start or end of a chapter. */
export function AuthorNote({ text, where }: { text: string; where: "start" | "end" }) {
  return (
    <aside className={cn("rounded-xl border-l-4 border-plum bg-plum-soft/60 px-4 py-3 font-sans text-sm", where === "start" ? "mb-8" : "mt-10")}>
      <p className="mb-1 text-xs font-bold tracking-widest text-plum uppercase">Author’s note</p>
      <p className="whitespace-pre-wrap text-ink">{text}</p>
    </aside>
  );
}
