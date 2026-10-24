import type { Metadata } from "next";
import type { JSONContent } from "@tiptap/react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StoryEditor } from "@/components/editor/StoryEditor";
import { getKidState } from "@/lib/family";
import { postingRules } from "@/lib/kids";
import { EditorSkeleton } from "@/components/editor/EditorSkeleton";
import { newChapter, newKey, type DraftStory } from "@/components/editor/model";
import { getFanficForEditing } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { isActiveUntil } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit story" };

export default function EditPage(props: PageProps<"/fanfic/[id]/edit">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EditStory params={props.params} />
    </Suspense>
  );
}

async function EditStory({ params }: { params: PageProps<"/fanfic/[id]/edit">["params"] }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  // Only the author gets a result, so other users see a 404.
  const story = await getFanficForEditing(id, user.id);
  if (!story) notFound();

  const tags = story.tags.map((t) => t.tag);
  const initial: DraftStory = {
    title: story.title,
    summary: story.summary,
    coverUrl: story.coverUrl,
    musicUrl: story.musicUrl ?? "",
    musicVolume: story.musicVolume,
    rating: story.rating,
    warnings: story.warnings,
    status: story.status,
    fandoms: tags.filter((t) => t.kind === "FANDOM").map(({ id, name }) => ({ id, name })),
    tags: tags.filter((t) => t.kind === "TAG").map(({ id, name }) => ({ id, name })),
    chapters: story.chapters.map((ch) => ({
      key: newKey(),
      id: ch.id,
      title: ch.title ?? "",
      noteStart: ch.noteStart ?? "",
      noteEnd: ch.noteEnd ?? "",
      // Only future times are kept; past ones mean the chapter is already out.
      publishAt: ch.publishAt && isActiveUntil(ch.publishAt) ? ch.publishAt.toISOString() : null,
      pages: ch.pages.map((p) => ({ key: newKey(), content: p.content as JSONContent })),
    })),
  };
  if (initial.chapters.length === 0) initial.chapters.push(newChapter());

  return (
    <StoryEditor
      fanficId={story.id}
      initial={initial}
      currentVisibility={story.visibility}
      serverUpdatedAt={story.updatedAt.toISOString()}
      username={user.username}
      rules={postingRules((await getKidState(user.id))?.controls ?? null)}
    />
  );
}
