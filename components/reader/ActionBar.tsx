"use client";

import type { ReactionType } from "@prisma/client";
import { useState, useTransition, type ReactNode } from "react";
import { toggleReactionAction, type ReactionState } from "@/actions/engagement";
import { toggleSaveAction } from "@/actions/library";
import { cn, formatCount } from "@/lib/utils";
import { BookmarkIcon, CommentIcon, FlagIcon, HeartIcon, ShareIcon, ThumbDownIcon } from "@/components/ui/icons";
import { CommentsPanel } from "./CommentsPanel";
import { ReportModal } from "./ReportModal";

type Props = {
  fanficId: string;
  title: string;
  initial: ReactionState;
  commentCount: number;
  hasReported: boolean;
  isAuthor: boolean;
  viewerId: string;
  viewerIsAdmin: boolean;
  /** Drafts can't be reacted to or commented on. */
  interactive: boolean;
  saved: boolean;
  /** Kids' accounts with comments off (the reader's, or the author's): no comments button. */
  commentsOff?: boolean;
};

function BarButton({
  label,
  pressed,
  onClick,
  children,
  disabled,
  tour,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  tour?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      data-tour={tour}
      className={cn(
        "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition disabled:opacity-40",
        pressed ? "bg-accent-soft text-accent" : "text-ink-soft hover:bg-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function ActionBar({
  fanficId,
  title,
  initial,
  commentCount,
  hasReported,
  isAuthor,
  viewerId,
  viewerIsAdmin,
  interactive,
  saved: initiallySaved,
  commentsOff,
}: Props) {
  const [reaction, setReaction] = useState(initial);
  const [comments, setComments] = useState(commentCount);
  const [reported, setReported] = useState(hasReported);
  const [saved, setSaved] = useState(initiallySaved);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flash(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage((m) => (m === text ? null : m)), 2500);
  }

  function react(type: ReactionType) {
    const previous = reaction;
    // Optimistic update, reconciled with the server's counts.
    const optimistic: ReactionState = { ...reaction, mine: reaction.mine === type ? null : type };
    if (reaction.mine === "LIKE") optimistic.likeCount--;
    if (reaction.mine === "DISLIKE") optimistic.dislikeCount--;
    if (optimistic.mine === "LIKE") optimistic.likeCount++;
    if (optimistic.mine === "DISLIKE") optimistic.dislikeCount++;
    setReaction(optimistic);
    startTransition(async () => {
      const result = await toggleReactionAction(fanficId, type);
      if ("error" in result) {
        setReaction(previous);
        flash(result.error);
      } else {
        setReaction(result);
      }
    });
  }

  async function share() {
    const url = `${window.location.origin}/fanfic/${fanficId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `Read “${title}” on Writt`, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied to clipboard");
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/fanfic/${fanficId}`);
      flash("Link copied to clipboard");
    } catch {
      flash("Couldn’t copy. Copy the address bar instead.");
    }
  }

  return (
    <>
      <div
        role="toolbar"
        aria-label="Story actions"
        className="flex items-center gap-1 rounded-2xl border border-line bg-surface/95 p-1.5 shadow-lift backdrop-blur"
      >
        <BarButton label={`Like (${reaction.likeCount})`} pressed={reaction.mine === "LIKE"} onClick={() => react("LIKE")} disabled={!interactive}>
          <HeartIcon filled={reaction.mine === "LIKE"} />
          <span aria-hidden>{formatCount(reaction.likeCount)}</span>
        </BarButton>
        <BarButton
          label={`Dislike (${reaction.dislikeCount})`}
          pressed={reaction.mine === "DISLIKE"}
          onClick={() => react("DISLIKE")}
          disabled={!interactive}
        >
          <ThumbDownIcon filled={reaction.mine === "DISLIKE"} />
          <span aria-hidden>{formatCount(reaction.dislikeCount)}</span>
        </BarButton>
        <span className="mx-0.5 h-6 w-px bg-line" aria-hidden />
        {!commentsOff && (
          <BarButton label={`Comments (${comments})`} onClick={() => setCommentsOpen(true)} disabled={!interactive} tour="comments">
            <CommentIcon />
            <span aria-hidden>{formatCount(comments)}</span>
          </BarButton>
        )}
        <BarButton
          label={saved ? "Saved to Library" : "Save to Library"}
          pressed={saved}
          disabled={!interactive}
          onClick={() =>
            startTransition(async () => {
              setSaved((s) => !s);
              const result = await toggleSaveAction(fanficId);
              if ("error" in result) {
                setSaved((s) => !s);
                flash(result.error);
              } else {
                setSaved(result.saved);
                flash(result.saved ? "Saved to your Library" : "Removed from your Library");
              }
            })
          }
        >
          <BookmarkIcon filled={saved} />
          <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
        </BarButton>
        <BarButton label="Share" onClick={() => void share()}>
          <ShareIcon />
          <span className="hidden sm:inline">Share</span>
        </BarButton>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="hidden h-11 items-center rounded-xl px-2 text-xs font-semibold text-ink-soft hover:bg-muted hover:text-ink sm:inline-flex"
        >
          Copy link
        </button>
        {!isAuthor && (
          <BarButton
            label={reported ? "Reported" : "Report"}
            onClick={() => (reported ? flash("You’ve already reported this story.") : setReportOpen(true))}
            pressed={reported}
            disabled={!interactive}
          >
            <FlagIcon />
          </BarButton>
        )}
      </div>
      <p aria-live="polite" className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2">
        {message && <span className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-paper shadow-lift">{message}</span>}
      </p>

      <CommentsPanel
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        fanficId={fanficId}
        viewerId={viewerId}
        viewerIsAdmin={viewerIsAdmin}
        onCountChange={(d) => setComments((n) => Math.max(0, n + d))}
      />
      {!isAuthor && (
        <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} fanficId={fanficId} onReported={() => setReported(true)} />
      )}
    </>
  );
}
