import type { JSONContent } from "@tiptap/react";
import { countWords, type RatingValue } from "@/lib/content";

export type TagRef = { id: string; name: string };
export type DraftPage = { key: string; content: JSONContent };
export type DraftChapter = {
  key: string;
  /** Database id, kept across saves so progress, scheduling and notifications follow the chapter. */
  id?: string;
  title: string;
  noteStart: string;
  noteEnd: string;
  /** ISO time to publish at, or null to publish with the book. */
  publishAt: string | null;
  pages: DraftPage[];
};
export type DraftStory = {
  title: string;
  summary: string;
  coverUrl: string | null;
  musicUrl: string;
  musicVolume: number;
  rating: RatingValue | null;
  warnings: string[];
  status: "ONGOING" | "COMPLETED";
  fandoms: TagRef[];
  tags: TagRef[];
  chapters: DraftChapter[];
};

let counter = 0;
export function newKey(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export const emptyContent = (): JSONContent => ({ type: "doc", content: [{ type: "paragraph" }] });
export const newPage = (): DraftPage => ({ key: newKey(), content: emptyContent() });
export const newChapter = (title = ""): DraftChapter => ({
  key: newKey(),
  title,
  noteStart: "",
  noteEnd: "",
  publishAt: null,
  pages: [newPage()],
});

export function emptyStory(): DraftStory {
  return {
    title: "",
    summary: "",
    coverUrl: null,
    musicUrl: "",
    musicVolume: 70,
    rating: null,
    warnings: [],
    status: "ONGOING",
    fandoms: [],
    tags: [],
    chapters: [newChapter()],
  };
}

/** Fills in fields missing from drafts saved on this device by older versions of the editor. */
export function normalizeStory(raw: Partial<DraftStory>): DraftStory {
  const base = emptyStory();
  return {
    ...base,
    ...raw,
    chapters: (raw.chapters?.length ? raw.chapters : base.chapters).map((c) => ({
      ...c,
      noteStart: c.noteStart ?? "",
      noteEnd: c.noteEnd ?? "",
      publishAt: c.publishAt ?? null,
    })),
  };
}

export function pageWords(content: JSONContent): number {
  const parts: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === "text" && n.text) parts.push(n.text);
    n.content?.forEach((child) => {
      walk(child);
      parts.push(" ");
    });
  };
  walk(content);
  return countWords(parts.join(""));
}

export function setChapterField(
  story: DraftStory,
  c: number,
  patch: Partial<Pick<DraftChapter, "noteStart" | "noteEnd" | "publishAt">>,
): DraftStory {
  return { ...story, chapters: story.chapters.map((ch, i) => (i === c ? { ...ch, ...patch } : ch)) };
}

export type Location = { c: number; p: number };

export function locate(story: DraftStory, pageKey: string): Location | null {
  for (const [c, chapter] of story.chapters.entries()) {
    const p = chapter.pages.findIndex((page) => page.key === pageKey);
    if (p !== -1) return { c, p };
  }
  return null;
}

function mapChapter(story: DraftStory, c: number, fn: (ch: DraftChapter) => DraftChapter): DraftStory {
  return { ...story, chapters: story.chapters.map((ch, i) => (i === c ? fn(ch) : ch)) };
}

export function setPageContent(story: DraftStory, pageKey: string, content: JSONContent): DraftStory {
  const loc = locate(story, pageKey);
  if (!loc) return story;
  return mapChapter(story, loc.c, (ch) => ({
    ...ch,
    pages: ch.pages.map((p, i) => (i === loc.p ? { ...p, content } : p)),
  }));
}

export function setChapterTitle(story: DraftStory, c: number, title: string): DraftStory {
  return mapChapter(story, c, (ch) => ({ ...ch, title }));
}

/** Inserts a page after `after` in its chapter. Returns the story and the new page's key. */
export function insertPage(story: DraftStory, after: Location): [DraftStory, string] {
  const page = newPage();
  const next = mapChapter(story, after.c, (ch) => {
    const pages = [...ch.pages];
    pages.splice(after.p + 1, 0, page);
    return { ...ch, pages };
  });
  return [next, page.key];
}

/** Inserts a chapter after chapter `after`. Returns the story and the new chapter's first page key. */
export function insertChapter(story: DraftStory, after: number): [DraftStory, string] {
  const chapter = newChapter();
  const chapters = [...story.chapters];
  chapters.splice(after + 1, 0, chapter);
  return [{ ...story, chapters }, chapter.pages[0].key];
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function moveChapter(story: DraftStory, c: number, delta: -1 | 1): DraftStory {
  return { ...story, chapters: move(story.chapters, c, c + delta) };
}

export function movePage(story: DraftStory, loc: Location, delta: -1 | 1): DraftStory {
  return mapChapter(story, loc.c, (ch) => ({ ...ch, pages: move(ch.pages, loc.p, loc.p + delta) }));
}

export function deletePage(story: DraftStory, loc: Location): DraftStory {
  const chapter = story.chapters[loc.c];
  if (chapter.pages.length <= 1) return story;
  return mapChapter(story, loc.c, (ch) => ({ ...ch, pages: ch.pages.filter((_, i) => i !== loc.p) }));
}

export function deleteChapter(story: DraftStory, c: number): DraftStory {
  if (story.chapters.length <= 1) return story;
  return { ...story, chapters: story.chapters.filter((_, i) => i !== c) };
}

/** True if the page has no text and no images. */
export function isPageEmpty(content: JSONContent): boolean {
  const walk = (n: JSONContent): boolean =>
    n.type === "image" || (n.type === "text" && Boolean(n.text?.trim())) || (n.content ?? []).some(walk);
  return !walk(content);
}

export function pagePreview(content: JSONContent, length = 48): string {
  const parts: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === "text" && n.text) parts.push(n.text);
    n.content?.forEach((child) => {
      walk(child);
      parts.push(" ");
    });
  };
  walk(content);
  const text = parts.join("").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
