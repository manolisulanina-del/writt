import type { Metadata } from "next";
import { Suspense } from "react";
import { StoryEditor } from "@/components/editor/StoryEditor";
import { emptyStory } from "@/components/editor/model";
import { EditorSkeleton } from "@/components/editor/EditorSkeleton";
import { CreationBlockedNotice } from "@/components/fanfic/CreationBlockedNotice";
import { LinkButton } from "@/components/ui/Button";
import { getKidState } from "@/lib/family";
import { postingRules } from "@/lib/kids";
import { getCreationBlock } from "@/lib/moderation";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "New story" };

export default function CreatePage() {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <NewStory />
    </Suspense>
  );
}

async function NewStory() {
  const user = await requireUser();
  const block = await getCreationBlock(user.id);
  if (block) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="mb-6 font-display text-4xl font-semibold tracking-tight">New books are paused</h1>
        <CreationBlockedNotice block={block} />
        <LinkButton href={`/u/${user.username}?tab=drafts`} variant="secondary" className="mt-6">
          Go to my books
        </LinkButton>
      </div>
    );
  }
  const kid = await getKidState(user.id);
  return <StoryEditor initial={emptyStory()} username={user.username} rules={postingRules(kid?.controls ?? null)} />;
}
