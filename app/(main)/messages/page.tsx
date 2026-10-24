import type { Metadata } from "next";
import { Suspense } from "react";
import { Chat } from "@/components/messages/Chat";
import { Inbox } from "@/components/messages/Inbox";
import { Skeleton } from "@/components/ui/EmptyState";
import { isAdmin } from "@/lib/auth/admin";
import { MESSAGE_MAX, getThread } from "@/lib/messages";
import { requireParent } from "@/lib/session";

export const metadata: Metadata = { title: "Messages" };

/** "Message admin": a chat with the creator of Writt. The admin gets their inbox here instead. */
export default function MessagesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Suspense fallback={<Skeleton className="h-[36rem]" />}>
        <Body />
      </Suspense>
    </div>
  );
}

async function Body() {
  const user = await requireParent();
  if (isAdmin(user)) {
    return (
      <>
        <h1 className="mb-6 font-display text-4xl font-semibold tracking-tight">Inbox</h1>
        <Inbox selected={null} />
      </>
    );
  }
  const thread = await getThread(user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Message the admin</h1>
      <p className="mt-1 mb-6 text-ink-soft">
        A private chat with the creator of Writt, for anything: questions, ideas or problems. Only you and the admin can see it. To ask for a removed book
        back, use an appeal instead.
      </p>
      <Chat
        messages={thread.messages}
        viewerIsAdmin={false}
        otherName="the creator of Writt"
        unread={thread.unreadByUser}
        max={MESSAGE_MAX}
        emptyText="Say hi! Messages go only to the creator of Writt, and replies show up right here."
      />
    </div>
  );
}
