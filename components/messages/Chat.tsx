"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { markChatReadAction, sendMessageAction } from "@/actions/messages";
import { SendIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type Message = { id: string; fromAdmin: boolean; body: string; at: string };

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

/**
 * A messenger-style chat between a user and the admin. New messages show up on
 * their own (the page refreshes every few seconds while it's open), and opening
 * the chat marks it as read.
 */
export function Chat({
  messages,
  viewerIsAdmin,
  otherName,
  to,
  unread,
  max,
  emptyText,
}: {
  messages: Message[];
  viewerIsAdmin: boolean;
  /** Who's on the other side, e.g. "The creator of Writt" or "@mira". */
  otherName: string;
  /** For the admin: the username they're writing to. */
  to?: string;
  /** Messages the viewer hasn't read yet. */
  unread: number;
  max: number;
  emptyText: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sending, startSending] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Sent but not yet back from the server, shown right away.
  const [pending, setPending] = useState<Message[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  // New messages arrive by refreshing while the tab is visible.
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const timer = setInterval(tick, 4000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [router]);

  useEffect(() => {
    if (unread > 0) void markChatReadAction(to);
  }, [unread, to]);

  // Once the server has a sent message, stop showing its local copy.
  const shown = [...messages, ...pending.filter((p) => !messages.some((m) => m.body === p.body && m.fromAdmin === p.fromAdmin && m.at >= p.at))];

  useLayoutEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [shown.length]);

  function send() {
    const body = text.trim();
    if (!body || sending) return;
    setError(null);
    const local: Message = { id: `pending-${Date.now()}`, fromAdmin: viewerIsAdmin, body, at: new Date(Date.now() - 1000).toISOString() };
    setPending((p) => [...p, local]);
    setText("");
    startSending(async () => {
      const result = await sendMessageAction(body, to);
      if ("error" in result) {
        setError(result.error);
        setPending((p) => p.filter((m) => m.id !== local.id));
        setText(body);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex h-[min(70vh,44rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-5" aria-live="polite" aria-label={`Chat with ${otherName}`}>
        {shown.length === 0 && <p className="mx-auto mt-10 max-w-sm text-center text-sm text-ink-soft">{emptyText}</p>}
        {shown.map((m, i) => {
          const mine = m.fromAdmin === viewerIsAdmin;
          const newDay = i === 0 || day(shown[i - 1].at) !== day(m.at);
          return (
            <div key={m.id}>
              {newDay && (
                <p className="my-3 text-center text-xs font-semibold text-ink-soft" suppressHydrationWarning>
                  {day(m.at)}
                </p>
              )}
              <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap shadow-card",
                    mine ? "rounded-br-md bg-accent text-on-accent" : "rounded-bl-md bg-muted text-ink",
                    m.id.startsWith("pending-") && "opacity-70",
                  )}
                >
                  <span className="sr-only">{mine ? "You" : otherName}: </span>
                  {m.body}
                  <span className={cn("mt-0.5 block text-right text-[10px]", mine ? "opacity-80" : "text-ink-soft")} suppressHydrationWarning>
                    {time(m.at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form
        className="border-t border-line bg-paper/60 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {error && (
          <p role="alert" className="mb-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="chat-message" className="sr-only">
            Message {otherName}
          </label>
          <textarea
            id="chat-message"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, max))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={`Message ${otherName}…`}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent transition hover:bg-accent-strong disabled:opacity-50"
            aria-label="Send"
          >
            <SendIcon className="size-5" />
          </button>
        </div>
        <p className="mt-1.5 text-xs text-ink-soft">Enter to send · Shift + Enter for a new line</p>
      </form>
    </div>
  );
}
