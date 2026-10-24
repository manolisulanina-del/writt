import "server-only";
import type { TagKind } from "@prisma/client";
import bannedConfig from "@/config/banned-tag-words.json";
import { prisma, isObjectId, isUniqueViolation } from "@/lib/db";
import { getSiteSettings } from "@/lib/settings";

// Tag rules, enforced on the server:
//  - 1 to 40 characters of letters, numbers, spaces and - ' & / !
//  - unique ignoring case and repeated spaces ("Slow Burn" == "slow  burn")
//  - no banned words (config/banned-tag-words.json plus the admin's /bantag list)

const ALLOWED = /^[\p{L}\p{N} \-'&/!]+$/u;

export function cleanTagName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function tagKey(input: string): string {
  return cleanTagName(input).toLowerCase();
}

export async function bannedTagWords(): Promise<string[]> {
  const fromFile = (bannedConfig.words ?? []).map((w) => w.toLowerCase().trim()).filter(Boolean);
  const fromAdmin = (await getSiteSettings()).bannedTagWords;
  return [...new Set([...fromFile, ...fromAdmin])];
}

/** The banned word a name contains, matched as a whole word, or null. */
export function findBannedWord(name: string, words: string[]): string | null {
  const key = tagKey(name);
  const compact = key.replace(/[^\p{L}\p{N}]/gu, "");
  for (const word of words) {
    const w = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${w}($|[^\\p{L}\\p{N}])`, "u").test(key)) return word;
    // Catch spaced-out or punctuated spellings of longer words ("k-y-s", "kill your self").
    if (word.length >= 4 && compact.includes(word.replace(/[^\p{L}\p{N}]/gu, ""))) return word;
  }
  return null;
}

export async function validateTagName(input: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const name = cleanTagName(input);
  if (name.length < 1 || name.length > 40) return { ok: false, error: "Tags must be 1 to 40 characters." };
  if (!ALLOWED.test(name)) return { ok: false, error: "Tags can only use letters, numbers, spaces and - ' & / !" };
  if (findBannedWord(name, await bannedTagWords())) return { ok: false, error: "That tag contains a word that isn’t allowed." };
  return { ok: true, name };
}

export type TagOption = { id: string; name: string; kind: TagKind; uses: number };

/** Suggestions for the tag picker: prefix matches first, then other matches, most used first. */
export async function searchTags(kind: TagKind, query: string, take = 8): Promise<TagOption[]> {
  const key = tagKey(query);
  const where = key ? { kind, key: { contains: key } } : { kind };
  const rows = await prisma.tag.findMany({
    where,
    take: 60,
    select: { id: true, name: true, kind: true, key: true, _count: { select: { books: true } } },
  });
  return rows
    .map((r) => ({ id: r.id, name: r.name, kind: r.kind, uses: r._count.books, prefix: key ? r.key.startsWith(key) : false }))
    .sort((a, b) => Number(b.prefix) - Number(a.prefix) || b.uses - a.uses || a.name.localeCompare(b.name))
    .slice(0, take)
    .map((t) => ({ id: t.id, name: t.name, kind: t.kind, uses: t.uses }));
}

/** Returns the existing tag with this name, or creates it. Never makes a duplicate. */
export async function getOrCreateTag(kind: TagKind, input: string, userId: string): Promise<{ ok: true; tag: TagOption } | { ok: false; error: string }> {
  const valid = await validateTagName(input);
  if (!valid.ok) return valid;
  const key = tagKey(valid.name);
  const existing = await prisma.tag.findUnique({ where: { kind_key: { kind, key } }, select: { id: true, name: true, kind: true } });
  if (existing) return { ok: true, tag: { ...existing, uses: 0 } };
  try {
    const tag = await prisma.tag.create({ data: { kind, name: valid.name, key, createdById: userId }, select: { id: true, name: true, kind: true } });
    return { ok: true, tag: { ...tag, uses: 0 } };
  } catch (error) {
    // Someone created the same tag a moment ago: use theirs.
    if (isUniqueViolation(error)) {
      const tag = await prisma.tag.findUniqueOrThrow({ where: { kind_key: { kind, key } }, select: { id: true, name: true, kind: true } });
      return { ok: true, tag: { ...tag, uses: 0 } };
    }
    throw error;
  }
}

/** Finds a tag by id or by name for admin commands. Ambiguous names across fandom/tag ask for the id. */
export async function resolveTag(input: string) {
  const raw = input.trim();
  const select = { id: true, name: true, kind: true, key: true } as const;
  if (isObjectId(raw)) return prisma.tag.findUnique({ where: { id: raw }, select });
  const prefixed = raw.match(/^(fandom|tag):(.+)$/i);
  if (prefixed) {
    const kind = prefixed[1].toUpperCase() as TagKind;
    return prisma.tag.findUnique({ where: { kind_key: { kind, key: tagKey(prefixed[2]) } }, select });
  }
  const matches = await prisma.tag.findMany({ where: { key: tagKey(raw) }, select });
  if (matches.length > 1) throw new Error(`“${raw}” is both a fandom and a tag. Write fandom:${raw} or tag:${raw}.`);
  return matches[0] ?? null;
}
