"use server";

import { updateTag } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, isUniqueViolation } from "@/lib/db";
import { announceBook } from "@/lib/announce";
import { awardCoinsForBook } from "@/lib/coins";
import { getKidState, notifyParents, type KidState } from "@/lib/family";
import { allowedOwnRatings } from "@/lib/kids";
import { FANDOM_LIMIT, NOTE_MAX, SUMMARY_MAX, TAG_LIMIT, WARNINGS, countWords } from "@/lib/content";
import { deleteBookAndImages, formatBlockDate, getCreationBlock } from "@/lib/moderation";
import { FEED_TAG, canView } from "@/lib/queries";
import { rateLimit } from "@/lib/rate-limit";
import { docText, excerptOf, isDocEmpty, sanitizeDoc } from "@/lib/rich-text";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/admin";
import { isStorageUrl } from "@/lib/storage/types";
import { musicUrlSchema, objectIdSchema, visibilitySchema } from "@/lib/validation";

const note = z.string().trim().max(NOTE_MAX, `Author’s notes can be at most ${NOTE_MAX.toLocaleString()} characters.`);

const saveSchema = z.object({
  id: objectIdSchema.optional(),
  title: z.string().trim().max(200, "Titles can be at most 200 characters."),
  summary: z.string().trim().max(SUMMARY_MAX, `Summaries can be at most ${SUMMARY_MAX} characters.`),
  coverUrl: z
    .string()
    .nullable()
    .refine((v) => v === null || isStorageUrl(v), "Upload the cover image again."),
  musicUrl: musicUrlSchema,
  musicVolume: z.number().int().min(0).max(100),
  visibility: visibilitySchema,
  rating: z.enum(["EVERYONE", "TEEN", "MATURE"]).nullable(),
  warnings: z.array(z.enum(WARNINGS)).max(WARNINGS.length),
  status: z.enum(["ONGOING", "COMPLETED"]),
  fandomIds: z.array(objectIdSchema).max(FANDOM_LIMIT, `Pick at most ${FANDOM_LIMIT} fandoms.`),
  tagIds: z.array(objectIdSchema).max(TAG_LIMIT, `A book can have up to ${TAG_LIMIT} tags.`),
  chapters: z
    .array(
      z.object({
        id: objectIdSchema.optional(),
        title: z.string().trim().max(200, "Chapter titles can be at most 200 characters."),
        noteStart: note,
        noteEnd: note,
        publishAt: z.iso.datetime({ offset: true }).nullable(),
        pages: z.array(z.object({ content: z.unknown() })).min(1).max(2000),
      }),
    )
    .min(1)
    .max(1000),
});

export type SaveFanficInput = z.input<typeof saveSchema>;
export type SaveFanficResult =
  | { ok: true; id: string; coins: number; awaitingApproval: boolean }
  | { ok: false; error: string };

/**
 * Kids' rules for posting (ages 7 to 15, from their parent's settings): which
 * age ranges they may use, whether they may publish at all, and whether a
 * parent must approve before a book goes public. Returns an error, or the
 * visibility to actually save and whether it now waits for approval.
 */
function kidPostingRules(
  kid: KidState | null,
  visibility: "DRAFT" | "PRIVATE" | "PUBLIC",
  rating: string | null,
): { error: string } | { visibility: "DRAFT" | "PRIVATE" | "PUBLIC"; awaitingApproval: boolean } {
  if (!kid || visibility === "DRAFT") return { visibility, awaitingApproval: false };
  if (!kid.controls.publishing) return { error: "Your parent turned off publishing for now. You can still save drafts." };
  const allowed = allowedOwnRatings(kid.controls);
  if (rating && !(allowed as string[]).includes(rating)) {
    return { error: allowed.length === 1 ? "Your books must be rated Everyone." : "Your books can be rated Everyone or Teen." };
  }
  // Ages 7 to 12 (unless the parent turned it off): a parent approves each book before it goes public.
  if (visibility === "PUBLIC" && kid.controls.approveBooks) return { visibility: "PRIVATE", awaitingApproval: true };
  return { visibility, awaitingApproval: false };
}

async function askParentToApprove(childId: string, username: string, title: string) {
  await notifyParents(childId, {
    kind: "BOOK_APPROVAL",
    title: `${username} wants to publish “${title}”`,
    body: `${username} asked to publish their book “${title}”. Read it and approve it in your family dashboard.`,
  });
}

class NotFoundError extends Error {}
class RemovedError extends Error {}

export async function saveFanficAction(input: SaveFanficInput): Promise<SaveFanficResult> {
  const user = await requireUser();

  const limit = await rateLimit(`save:${user.id}`, 60, 10 * 60_000);
  if (!limit.ok) return { ok: false, error: "You’re saving very often. Wait a minute and try again." };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  // Authors whose book was removed for reports can't create new books until the block ends.
  if (!data.id) {
    const block = await getCreationBlock(user.id);
    if (block) return { ok: false, error: `You can’t create new books until ${formatBlockDate(block.until)}.` };
  }

  const now = Date.now();
  const chapters = data.chapters.map((ch) => {
    const pages = ch.pages.map((p) => sanitizeDoc(p.content));
    const publishAt = ch.publishAt ? new Date(ch.publishAt) : null;
    return {
      id: ch.id,
      title: ch.title || null,
      noteStart: ch.noteStart || null,
      noteEnd: ch.noteEnd || null,
      // A time in the past just means "published now".
      publishAt: publishAt && publishAt.getTime() > now ? publishAt : null,
      pages,
      wordCount: pages.reduce((n, doc) => n + countWords(docText(doc)), 0),
    };
  });
  const firstText = chapters.flatMap((c) => c.pages).find((doc) => !isDocEmpty(doc));

  // Fandoms and tags must exist and be the right kind.
  const tagIds = [...new Set([...data.fandomIds, ...data.tagIds])];
  const tags = await prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true, kind: true } });
  const fandoms = tags.filter((t) => t.kind === "FANDOM" && data.fandomIds.includes(t.id));
  const plainTags = tags.filter((t) => t.kind === "TAG" && data.tagIds.includes(t.id));
  if (fandoms.length !== new Set(data.fandomIds).size || plainTags.length !== new Set(data.tagIds).size) {
    return { ok: false, error: "One of the fandoms or tags no longer exists. Remove it and try again." };
  }

  if (data.visibility !== "DRAFT") {
    if (!data.title) return { ok: false, error: "Give your story a title before posting." };
    if (!firstText) return { ok: false, error: "Write something before posting. Your story is empty." };
    if (!data.rating) return { ok: false, error: "Choose an age range (Everyone, Teen 13+ or Mature 18+) before posting." };
    if (fandoms.length === 0) return { ok: false, error: "Pick at least one fandom before posting (use “Original” for your own worlds)." };
  }

  const kid = await getKidState(user.id);
  const posting = kidPostingRules(kid, data.visibility, data.rating);
  if ("error" in posting) return { ok: false, error: posting.error };

  const published = chapters.filter((c) => !c.publishAt);
  const fields = {
    title: data.title || "Untitled story",
    summary: data.summary,
    excerpt: firstText ? excerptOf(firstText) : "",
    coverUrl: data.coverUrl,
    musicUrl: data.musicUrl,
    musicVolume: data.musicVolume,
    visibility: posting.visibility,
    awaitingApproval: posting.awaitingApproval,
    rating: data.rating,
    warnings: data.warnings,
    status: data.status,
    wordCount: published.reduce((n, c) => n + c.wordCount, 0),
    chapterCount: published.length,
    contentUpdatedAt: new Date(),
  };

  let wasAwaiting = false;
  try {
    const id = await prisma.$transaction(
      async (tx) => {
        let fanficId: string;
        let existingChapterIds: string[] = [];
        if (data.id) {
          const existing = await tx.fanfic.findFirst({
            where: { id: data.id, authorId: user.id },
            select: { id: true, publishedAt: true, removed: true, awaitingApproval: true, chapters: { select: { id: true } } },
          });
          if (!existing) throw new NotFoundError();
          if (existing.removed) throw new RemovedError();
          await tx.fanfic.update({
            where: { id: existing.id },
            data: { ...fields, publishedAt: existing.publishedAt ?? (posting.visibility === "PUBLIC" ? new Date() : null) },
          });
          fanficId = existing.id;
          wasAwaiting = existing.awaitingApproval;
          existingChapterIds = existing.chapters.map((c) => c.id);
        } else {
          const created = await tx.fanfic.create({
            data: {
              ...fields,
              authorId: user.id,
              publishedAt: posting.visibility === "PUBLIC" ? new Date() : null,
              announcedAt: null,
              coinsCheckedAt: null,
            },
            select: { id: true },
          });
          fanficId = created.id;
        }

        // Chapters keep their ids across saves (reading progress, scheduling and
        // "new chapter" notifications depend on it). Move existing ones to
        // temporary negative orders first so reordering can't collide.
        const keep = new Set(chapters.map((c) => c.id).filter((id): id is string => Boolean(id && existingChapterIds.includes(id))));
        const removed = existingChapterIds.filter((id) => !keep.has(id));
        await tx.page.deleteMany({ where: { chapterId: { in: existingChapterIds } } });
        await tx.chapter.deleteMany({ where: { id: { in: removed } } });
        for (const [i, id] of [...keep].entries()) await tx.chapter.update({ where: { id }, data: { order: -1 - i } });

        for (const [order, chapter] of chapters.entries()) {
          const fields = {
            order,
            title: chapter.title,
            noteStart: chapter.noteStart,
            noteEnd: chapter.noteEnd,
            publishAt: chapter.publishAt,
            wordCount: chapter.wordCount,
          };
          const pages = chapter.pages.map((content, pageOrder) => ({ order: pageOrder, content: content as unknown as Prisma.InputJsonValue }));
          if (chapter.id && keep.has(chapter.id)) {
            await tx.chapter.update({ where: { id: chapter.id }, data: { ...fields, pages: { create: pages } } });
          } else {
            await tx.chapter.create({ data: { ...fields, fanficId, announcedAt: null, pages: { create: pages } } });
          }
        }

        await tx.bookTag.deleteMany({ where: { fanficId } });
        if (tagIds.length) await tx.bookTag.createMany({ data: tagIds.map((tagId) => ({ fanficId, tagId })) });
        return fanficId;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    await announceBook(id);
    const coins = await awardCoinsForBook(id);
    if (posting.awaitingApproval && !wasAwaiting) await askParentToApprove(user.id, user.username, fields.title);
    updateTag(FEED_TAG);
    return { ok: true, id, coins, awaitingApproval: posting.awaitingApproval };
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: "That story no longer exists." };
    if (error instanceof RemovedError) return { ok: false, error: "This book was removed by moderation, so it can’t be edited. You can appeal the removal." };
    console.error("saveFanfic failed", error);
    return { ok: false, error: "Couldn’t save your story. Your work is still saved on this device, so try again." };
  }
}

export async function setVisibilityAction(fanficId: string, visibility: "DRAFT" | "PRIVATE" | "PUBLIC") {
  const user = await requireUser();
  const id = objectIdSchema.parse(fanficId);
  const next = visibilitySchema.parse(visibility);

  const story = await prisma.fanfic.findFirst({
    where: { id, authorId: user.id },
    select: {
      title: true,
      publishedAt: true,
      removed: true,
      rating: true,
      awaitingApproval: true,
      tags: { where: { tag: { kind: "FANDOM" } }, select: { id: true } },
    },
  });
  if (!story) return { ok: false as const, error: "Story not found." };
  if (story.removed) return { ok: false as const, error: "This book was removed by moderation. Appeal the removal to get it back." };
  if (next !== "DRAFT" && (!story.rating || story.tags.length === 0)) {
    return { ok: false as const, error: "Open the editor and add a rating and a fandom before posting." };
  }

  const posting = kidPostingRules(await getKidState(user.id), next, story.rating);
  if ("error" in posting) return { ok: false as const, error: posting.error };

  await prisma.fanfic.update({
    where: { id },
    data: {
      visibility: posting.visibility,
      awaitingApproval: posting.awaitingApproval,
      publishedAt: story.publishedAt ?? (posting.visibility === "PUBLIC" ? new Date() : null),
    },
  });
  let coins = 0;
  if (posting.visibility === "PUBLIC") {
    await announceBook(id);
    coins = await awardCoinsForBook(id);
  }
  if (posting.awaitingApproval && !story.awaitingApproval) await askParentToApprove(user.id, user.username, story.title);
  updateTag(FEED_TAG);
  return { ok: true as const, coins, awaitingApproval: posting.awaitingApproval };
}

export async function deleteFanficAction(fanficId: string) {
  const user = await requireUser();
  const id = objectIdSchema.parse(fanficId);
  const story = await prisma.fanfic.findFirst({ where: { id, authorId: user.id }, select: { id: true } });
  if (!story) return { ok: false as const, error: "Story not found." };

  await deleteBookAndImages(id);
  updateTag(FEED_TAG);
  return { ok: true as const };
}

/** Counts a view once per user per story; repeat visits and refreshes are ignored. */
export async function recordViewAction(fanficId: string) {
  const user = await requireUser();
  const parsed = objectIdSchema.safeParse(fanficId);
  if (!parsed.success) return;

  const story = await prisma.fanfic.findUnique({
    where: { id: parsed.data },
    select: { visibility: true, authorId: true, removed: true },
  });
  if (!story || story.visibility === "DRAFT" || !canView(story, { id: user.id, isAdmin: isAdmin(user) })) return;

  const key = { userId_fanficId: { userId: user.id, fanficId: parsed.data } };
  if (await prisma.view.findUnique({ where: key, select: { id: true } })) return;
  try {
    // The unique index still guards against two tabs racing past the check above.
    await prisma.view.create({ data: { userId: user.id, fanficId: parsed.data } });
  } catch (error) {
    if (isUniqueViolation(error)) return;
    throw error;
  }
  await prisma.fanfic.update({ where: { id: parsed.data }, data: { views: { increment: 1 } } });
}
