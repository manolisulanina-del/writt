import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox } from "@/components/messages/Inbox";
import { Skeleton } from "@/components/ui/EmptyState";
import { requireAdmin } from "@/lib/auth/admin";

export const metadata: Metadata = { title: "Inbox", robots: { index: false } };

/** The admin's inbox with one chat open. Everyone else gets a 404 (also enforced in proxy.ts). */
export default function ConversationPage(props: PageProps<"/messages/[username]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Suspense fallback={<Skeleton className="h-[36rem]" />}>
        <Body params={props.params} />
      </Suspense>
    </div>
  );
}

async function Body({ params }: { params: PageProps<"/messages/[username]">["params"] }) {
  const [{ username }] = await Promise.all([params, requireAdmin()]);
  return (
    <>
      <h1 className="mb-6 font-display text-4xl font-semibold tracking-tight max-md:hidden">Inbox</h1>
      <Inbox selected={decodeURIComponent(username)} />
    </>
  );
}
