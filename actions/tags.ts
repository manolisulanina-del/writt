"use server";

import type { TagKind } from "@prisma/client";
import { rateLimit, retryMessage } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { getOrCreateTag, searchTags, tagKey, type TagOption } from "@/lib/tags";

const isKind = (k: unknown): k is TagKind => k === "FANDOM" || k === "TAG";

/** Suggestions while typing, plus whether an exact match exists (to offer "Create tag"). */
export async function searchTagsAction(kind: TagKind, query: string): Promise<{ options: TagOption[]; exact: boolean }> {
  await requireUser();
  if (!isKind(kind)) return { options: [], exact: false };
  const q = String(query ?? "").slice(0, 60);
  const options = await searchTags(kind, q);
  return { options, exact: options.some((o) => tagKey(o.name) === tagKey(q)) };
}

/** "Create tag: …" — creates the tag (or returns the existing one with that name). Rules are enforced in lib/tags.ts. */
export async function createTagAction(kind: TagKind, name: string): Promise<{ tag: TagOption } | { error: string }> {
  const user = await requireUser();
  if (!isKind(kind)) return { error: "Unknown tag type." };
  const limit = await rateLimit(`tag-create:${user.id}`, 30, 60 * 60_000);
  if (!limit.ok) return { error: retryMessage(limit.retryAfterSeconds) };
  const result = await getOrCreateTag(kind, String(name ?? ""), user.id);
  return result.ok ? { tag: result.tag } : { error: result.error };
}
