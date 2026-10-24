"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  addCommentAction,
  deleteCommentAction,
  listCommentsAction,
  toggleCommentHeartAction,
  type CommentThread,
  type CommentView,
} from "@/actions/engagement";
import { CommentAdminMenu } from "@/components/admin/menus";
import { Handle } from "@/components/ui/AdminBadge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Spinner } from "@/components/ui/Spinner";
import { inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  fanficId: string;
  viewerId: string;
  viewerIsAdmin: boolean;
  onCountChange: (delta: number) => void;
};

export function CommentsPanel({ open, onClose, fanficId, viewerId, viewerIsAdmin, onCountChange }: Props) {
  const [threads, setThreads] = useState<CommentThread[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [locked, setLocked] = useState(false);
  const [isBookAuthor, setIsBookAuthor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [posting, startPosting] = useTransition();
  const [loadingMore, startLoadingMore] = useTransition();

  const apply = useCallback((result: Awaited<ReturnType<typeof listCommentsAction>>, append: boolean) => {
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setThreads((prev) => (append && prev ? [...prev, ...result.comments] : result.comments));
    setHasMore(result.hasMore);
    setLocked(result.locked);
    setIsBookAuthor(result.isBookAuthor);
  }, []);

  // Fetch fresh comments each time the panel opens.
  useEffect(() => {
    if (!open) return;
    let active = true;
    listCommentsAction(fanficId).then((result) => active && apply(result, false));
    return () => {
      active = false;
    };
  }, [open, fanficId, apply]);

  async function loadOlder(before: string) {
    apply(await listCommentsAction(fanficId, before), true);
  }

  function post() {
    startPosting(async () => {
      const result = await addCommentAction(fanficId, body, replyTo?.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      setBody("");
      const comment = result.comment;
      setThreads((prev) => {
        if (!comment.parentId) return [{ ...comment, replies: [] }, ...(prev ?? [])];
        return (prev ?? []).map((t) => (t.id === comment.parentId ? { ...t, replies: [...t.replies, comment] } : t));
      });
      setReplyTo(null);
      onCountChange(1);
    });
  }

  /** Removes a comment (and, for a top-level one, its replies) from the list. */
  function drop(id: string, removed = 1) {
    setThreads((prev) =>
      (prev ?? []).filter((t) => t.id !== id).map((t) => ({ ...t, replies: t.replies.filter((r) => r.id !== id) })),
    );
    onCountChange(-removed);
  }

  async function remove(c: CommentView) {
    if (!window.confirm(c.parentId ? "Delete this reply?" : "Delete this comment and its replies?")) return;
    const result = await deleteCommentAction(c.id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    drop(c.id, result.removed);
  }

  async function heart(c: CommentView) {
    const result = await toggleCommentHeartAction(c.id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const update = (x: CommentView) => (x.id === c.id ? { ...x, authorHeart: result.hearted } : x);
    setThreads((prev) => (prev ?? []).map((t) => ({ ...update(t), replies: t.replies.map(update) }) as CommentThread));
  }

  const remaining = 2000 - body.length;
  const canWrite = !locked || viewerIsAdmin;
  const itemProps = {
    viewerId,
    viewerIsAdmin,
    isBookAuthor,
    canWrite,
    onReply: (c: CommentView) => {
      setReplyTo({ id: c.parentId ?? c.id, username: c.author.username });
      document.getElementById("new-comment")?.focus();
    },
    onRemove: (c: CommentView) => void remove(c),
    onHeart: (c: CommentView) => void heart(c),
    onAdminDeleted: (c: CommentView) =>
      drop(c.id, c.parentId ? 1 : 1 + ((threads ?? []).find((t) => t.id === c.id)?.replies.length ?? 0)),
  };

  return (
    <Modal open={open} onClose={onClose} title="Comments" description="Feedback and thoughts from readers" placement="side">
      <div className="flex min-h-0 flex-1 flex-col">
        {locked && (
          <p role="status" className="border-b border-line bg-muted px-4 py-3 text-sm font-medium text-ink-soft">
            Comments are turned off for this book.
          </p>
        )}
        <form
          hidden={!canWrite}
          className="space-y-2 border-b border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) post();
          }}
        >
          {replyTo && (
            <p className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-xs">
              <span>
                Replying to <strong>@{replyTo.username}</strong>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} className="font-semibold text-ink-soft hover:text-ink">
                Cancel
              </button>
            </p>
          )}
          <label htmlFor="new-comment" className="sr-only">
            {replyTo ? "Write a reply" : "Write a comment"}
          </label>
          <textarea
            id="new-comment"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) post();
            }}
            placeholder={replyTo ? "Write a reply…" : "Comment anything…"}
            maxLength={2000}
            rows={3}
            className={cn(inputClass, "resize-none")}
          />
          <div className="flex items-center justify-between">
            <span className={cn("text-xs", remaining < 100 ? "text-danger" : "text-ink-soft")}>
              {remaining < 300 ? `${remaining} characters left` : "Ctrl + Enter to post"}
            </span>
            <Button type="submit" size="sm" loading={posting} disabled={!body.trim()}>
              {replyTo ? "Reply" : "Post"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite">
          {threads === null ? (
            !error && (
              <div className="flex justify-center py-10">
                <Spinner label="Loading comments…" />
              </div>
            )
          ) : threads.length === 0 ? (
            <EmptyState title="No comments yet">Be the first to tell the author what you think.</EmptyState>
          ) : (
            <ul className="space-y-6">
              {threads.map((t) => (
                <li key={t.id}>
                  <CommentItem c={t} {...itemProps} />
                  {t.replies.length > 0 && (
                    <ul className="mt-3 ml-11 space-y-3 border-l-2 border-line pl-3" aria-label={`Replies to @${t.author.username}`}>
                      {t.replies.map((r) => (
                        <li key={r.id}>
                          <CommentItem c={r} reply {...itemProps} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {hasMore && threads && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => startLoadingMore(() => loadOlder(threads[threads.length - 1].createdAt))}>
                Load older comments
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

type ItemProps = {
  c: CommentView;
  reply?: boolean;
  viewerId: string;
  viewerIsAdmin: boolean;
  isBookAuthor: boolean;
  canWrite: boolean;
  onReply: (c: CommentView) => void;
  onRemove: (c: CommentView) => void;
  onHeart: (c: CommentView) => void;
  onAdminDeleted: (c: CommentView) => void;
};

function CommentItem({ c, reply, viewerId, viewerIsAdmin, isBookAuthor, canWrite, onReply, onRemove, onHeart, onAdminDeleted }: ItemProps) {
  return (
    <div className="flex gap-3">
      <Link href={`/u/${c.author.username}`} className="shrink-0 rounded-full">
        <Avatar src={c.author.image} name={c.author.username} size={reply ? 28 : 34} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <Link href={`/u/${c.author.username}`} className="font-semibold hover:underline">
            <Handle username={c.author.username} role={c.author.role} />
          </Link>
          <RelativeTime iso={c.createdAt} className="text-xs text-ink-soft" />
          {viewerIsAdmin && c.authorId !== viewerId ? (
            <span className="ml-auto">
              <CommentAdminMenu commentId={c.id} author={c.author.username} onDeleted={() => onAdminDeleted(c)} />
            </span>
          ) : (
            c.authorId === viewerId && (
              <button type="button" onClick={() => onRemove(c)} className="ml-auto text-xs font-semibold text-ink-soft hover:text-danger">
                Delete
              </button>
            )
          )}
        </div>
        <p className="mt-1 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{c.body}</p>
        <div className="mt-1.5 flex items-center gap-3 text-xs font-semibold text-ink-soft">
          {canWrite && (
            <button type="button" onClick={() => onReply(c)} className="hover:text-ink">
              Reply
            </button>
          )}
          {isBookAuthor ? (
            <button
              type="button"
              onClick={() => onHeart(c)}
              aria-pressed={c.authorHeart}
              className={cn("hover:text-accent", c.authorHeart && "text-accent")}
              title={c.authorHeart ? "Remove your heart" : "Heart this comment as the author"}
            >
              {c.authorHeart ? "❤ by author" : "♡ Heart"}
            </button>
          ) : (
            c.authorHeart && <span className="text-accent">❤ by author</span>
          )}
        </div>
      </div>
    </div>
  );
}
