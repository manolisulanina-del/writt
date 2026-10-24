"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { markTutorialSeenAction } from "@/actions/onboarding";
import { Button } from "@/components/ui/Button";
import { CommentIcon, FlagIcon, HeartIcon, ShareIcon } from "@/components/ui/icons";

type Step = { target?: string; title: string; body: string; extra?: "reader" };

const STEPS: Step[] = [
  {
    target: "feed",
    title: "Your homepage feed",
    body: "The most-read stories rise to the top. The ones everyone’s reading right now get a Hot label.",
  },
  {
    target: "create",
    title: "Write your own",
    body: "Press Create any time to open the editor. Add pages, chapters, pictures and even a soundtrack.",
  },
  {
    title: "Read, react and comment",
    body: "Inside a story, flip through pages and chapters. The bar at the bottom lets you like, comment, share or report.",
    extra: "reader",
  },
  {
    target: "profile",
    title: "Your profile",
    body: "Tap your avatar to see your published stories, private posts and drafts, and to edit your profile.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

export function Tutorial() {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = STEPS[index];

  const finish = useCallback(() => {
    setOpen(false);
    void markTutorialSeenAction();
  }, []);

  const measure = useCallback(() => {
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: Math.min(r.height + 16, window.innerHeight * 0.6) });
  }, [step.target]);

  // The target may stream in after the tour (the feed loads separately), so
  // wait for it to appear, then re-measure whenever it resizes.
  useLayoutEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
    let frame = requestAnimationFrame(measure);
    if (!step.target) return () => cancelAnimationFrame(frame);

    const remeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(remeasure);
    const attach = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) return false;
      // Bring page targets into view just below the sticky navbar; navbar targets are always visible.
      const r = el.getBoundingClientRect();
      const navBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      if (!el.closest("header") && (r.top < navBottom || r.bottom > window.innerHeight)) {
        window.scrollTo({ top: window.scrollY + r.top - navBottom - 16, behavior: "instant" as ScrollBehavior });
      }
      resize.observe(el);
      remeasure();
      return true;
    };
    let mutations: MutationObserver | null = null;
    if (!attach()) {
      mutations = new MutationObserver(() => {
        if (attach()) mutations?.disconnect();
      });
      mutations.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations?.disconnect();
    };
  }, [open, measure, step.target]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, finish, measure]);

  if (!open) return null;

  // Place the card below the highlight when there's room, otherwise above; centered with no target.
  const cardStyle: React.CSSProperties = rect
    ? rect.top + rect.height + 260 < window.innerHeight
      ? { top: rect.top + rect.height + 12, left: Math.min(Math.max(rect.left, 16), window.innerWidth - 356) }
      : { top: Math.max(rect.top - 252, 16), left: Math.min(Math.max(rect.left, 16), window.innerWidth - 356) }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-accent transition-all duration-300"
          style={{ ...rect, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)" }}
          aria-hidden
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" aria-hidden />
      )}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="absolute w-[min(340px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-5 shadow-lift outline-none"
        style={cardStyle}
      >
        <p className="text-xs font-bold tracking-widest text-accent uppercase">
          Welcome tour · {index + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-1 font-display text-xl font-semibold">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-sm text-ink-soft">
          {step.body}
        </p>
        {step.extra === "reader" && (
          <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-line bg-paper p-2.5 text-ink-soft" aria-hidden>
            <HeartIcon className="size-5 text-accent" filled />
            <CommentIcon className="size-5" />
            <ShareIcon className="size-5" />
            <FlagIcon className="size-5" />
          </div>
        )}
        <div className="mt-5 flex items-center gap-2">
          <button type="button" onClick={finish} className="text-sm font-semibold text-ink-soft hover:text-ink">
            Skip
          </button>
          <div className="ml-auto flex gap-2">
            {index > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            )}
            {index < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setIndex(index + 1)}>
                Next
              </Button>
            ) : (
              <Button size="sm" onClick={finish}>
                Start exploring
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
