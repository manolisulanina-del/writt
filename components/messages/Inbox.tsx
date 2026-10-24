import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { prisma } from "@/lib/db";
import { MESSAGE_MAX, getInbox, getThread } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { Chat } from "./Chat";

/** The admin's inbox: every chat on the left, the open one on the right (one at a time on phones). */
export async function Inbox({ selected }: { selected: string | null }) {
  const [chats, person] = await Promise.all([
    getInbox(),
    selected ? prisma.user.findUnique({ where: { username: selected.toLowerCase() }, select: { id: true, username: true, nickname: true, kind: true } }) : null,
  ]);
  if (selected && (!person || person.kind === "FAMILY")) notFound();
  const thread = person ? await getThread(person.id) : null;

  return (
    <div className="grid gap-6 md:grid-cols-[19rem_1fr]">
      <nav aria-label="Conversations" className={cn(selected && "max-md:hidden")}>
        {chats.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">No messages yet.</p>
        ) : (
          <ul className="space-y-1">
            {chats.map((c) => (
              <li key={c.user.username}>
                <Link
                  href={`/messages/${c.user.username}`}
                  aria-current={c.user.username === person?.username ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-muted",
                    c.user.username === person?.username && "bg-muted",
                  )}
                >
                  <Avatar src={c.user.image} name={c.user.username} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate", c.unreadByAdmin ? "font-bold" : "font-semibold")}>@{c.user.username}</span>
                      <RelativeTime iso={c.lastMessageAt} className="shrink-0 text-xs text-ink-soft" />
                    </span>
                    <span className={cn("block truncate text-sm", c.unreadByAdmin ? "font-semibold text-ink" : "text-ink-soft")}>{c.lastPreview}</span>
                  </span>
                  {c.unreadByAdmin > 0 && (
                    <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-xs leading-5 font-bold text-on-accent">
                      {c.unreadByAdmin}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>
      <section aria-label="Conversation">
        {person && thread ? (
          <>
            <div className="mb-3 flex items-center gap-3">
              <Link href="/messages" className="text-sm font-semibold text-ink-soft hover:text-ink md:hidden">
                ← Inbox
              </Link>
              <h2 className="font-display text-2xl font-semibold">
                <Link href={`/u/${person.username}`} className="hover:text-accent">
                  @{person.username}
                </Link>
              </h2>
            </div>
            <Chat
              messages={thread.messages}
              viewerIsAdmin
              otherName={`@${person.username}`}
              to={person.username}
              unread={thread.unreadByAdmin}
              max={MESSAGE_MAX}
              emptyText={`No messages with @${person.username} yet. Write the first one.`}
            />
          </>
        ) : (
          <div className="flex h-full min-h-60 items-center justify-center rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft max-md:hidden">
            Pick a conversation to read and reply.
          </div>
        )}
      </section>
    </div>
  );
}
