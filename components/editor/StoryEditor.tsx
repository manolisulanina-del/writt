"use client";

import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Visibility } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveFanficAction, type SaveFanficInput } from "@/actions/fanfic";
import { NOTE_MAX } from "@/lib/content";
import { uploadImage } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ListIcon, PlusIcon } from "@/components/ui/icons";
import { DetailsPanel } from "./DetailsPanel";
import { PublishingPanel } from "./PublishingPanel";
import type { PostingRules } from "@/lib/kids";
import { DoneDialog } from "./DoneDialog";
import { DraftConfirmDialog } from "./DraftConfirmDialog";
import { Outline } from "./Outline";
import { Toolbar } from "./Toolbar";
import {
  deleteChapter,
  deletePage,
  insertChapter,
  insertPage,
  locate,
  moveChapter,
  movePage,
  normalizeStory,
  pageWords,
  setChapterField,
  setChapterTitle,
  setPageContent,
  type DraftStory,
  type Location,
} from "./model";

type LocalDraft = { story: DraftStory; savedAt: number };

type Props = {
  fanficId?: string;
  initial: DraftStory;
  currentVisibility?: Visibility;
  /** ISO time of the last server save, used to decide whether a local draft is newer. */
  serverUpdatedAt?: string;
  username: string;
  /** Kids' accounts: allowed age ranges, publishing, and parent approval (lib/kids.ts). */
  rules?: PostingRules;
};

function readLocal(key: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft;
    return parsed?.story?.chapters?.length ? { ...parsed, story: normalizeStory(parsed.story) } : null;
  } catch {
    return null;
  }
}

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
}

export function StoryEditor({ fanficId, initial, currentVisibility, serverUpdatedAt, username, rules }: Props) {
  const router = useRouter();
  const storageKey = `writt:draft:${fanficId ?? "new"}`;

  const [story, setStory] = useState<DraftStory>(initial);
  const [activeKey, setActiveKey] = useState(initial.chapters[0].pages[0].key);
  const [dirty, setDirty] = useState(false);
  const [savedLocallyAt, setSavedLocallyAt] = useState<number | null>(null);
  const [restorable, setRestorable] = useState<LocalDraft | null>(null);
  const [uploads, setUploads] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [saving, setSaving] = useState<Visibility | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const storyRef = useRef(story);
  const activeKeyRef = useRef(activeKey);
  const editorRef = useRef<Editor | null>(null);
  const chapterTitleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storyRef.current = story;
    activeKeyRef.current = activeKey;
  });

  const loc: Location = locate(story, activeKey) ?? { c: 0, p: 0 };
  const chapter = story.chapters[loc.c];

  function update(next: DraftStory | ((s: DraftStory) => DraftStory)) {
    setStory(next);
    setDirty(true);
  }

  async function insertImages(files: File[], pos?: number) {
    setUploadError(null);
    setUploads((n) => n + files.length);
    for (const file of files) {
      try {
        const src = await uploadImage(file);
        const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 120);
        const editor = editorRef.current;
        if (!editor) continue;
        const node = { type: "image", attrs: { src, alt } };
        if (pos !== undefined) editor.chain().insertContentAt(pos, node).run();
        else editor.chain().focus().insertContent(node).run();
      } catch (e) {
        setUploadError((e as Error).message);
      } finally {
        setUploads((n) => n - 1);
      }
    }
  }
  const insertImagesRef = useRef(insertImages);
  useEffect(() => {
    insertImagesRef.current = insertImages;
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
      }),
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: "Once upon a time…" }),
    ],
    content: initial.chapters[0].pages[0].content,
    editorProps: {
      attributes: { class: "prose-writt", "aria-label": "Story text", role: "textbox", "aria-multiline": "true" },
      handleDrop: (view, event, _slice, moved) => {
        const files = imageFiles(event.dataTransfer?.files);
        if (moved || files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImagesRef.current(files, pos);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        void insertImagesRef.current(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const key = activeKeyRef.current;
      const json = e.getJSON();
      setStory((s) => setPageContent(s, key, json));
      setDirty(true);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Load the active page into the editor whenever it changes.
  useEffect(() => {
    if (!editor) return;
    const l = locate(storyRef.current, activeKey);
    if (!l) return;
    editor.commands.setContent(storyRef.current.chapters[l.c].pages[l.p].content, { emitUpdate: false });
    editor.commands.focus("start");
  }, [editor, activeKey]);

  // Offer to restore a local draft that is newer than the server copy.
  useEffect(() => {
    const local = readLocal(storageKey);
    if (local && (!serverUpdatedAt || local.savedAt > Date.parse(serverUpdatedAt))) {
      setRestorable(local); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    }
  }, [storageKey, serverUpdatedAt]);

  // Autosave to this device while typing.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      const savedAt = Date.now();
      try {
        localStorage.setItem(storageKey, JSON.stringify({ story, savedAt } satisfies LocalDraft));
        setSavedLocallyAt(savedAt);
      } catch {
        // Storage full or blocked: the server save still works.
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [story, dirty, storageKey]);

  function open(pageKey: string) {
    setActiveKey(pageKey);
    setOutlineOpen(false);
  }

  function addPage() {
    const [next, key] = insertPage(story, loc);
    update(next);
    setActiveKey(key);
  }

  function addChapter() {
    const [next, key] = insertChapter(story, loc.c);
    update(next);
    setActiveKey(key);
    requestAnimationFrame(() => chapterTitleRef.current?.focus());
  }

  function removePage(target: Location) {
    const next = deletePage(story, target);
    update(next);
    if (target.c === loc.c && target.p === loc.p) {
      const pages = next.chapters[target.c].pages;
      setActiveKey(pages[Math.min(target.p, pages.length - 1)].key);
    }
  }

  function removeChapter(c: number) {
    const next = deleteChapter(story, c);
    update(next);
    if (c === loc.c) setActiveKey(next.chapters[Math.min(c, next.chapters.length - 1)].pages[0].key);
  }

  async function save(visibility: Visibility) {
    setSaving(visibility);
    setSaveError(null);
    let result: Awaited<ReturnType<typeof saveFanficAction>>;
    try {
      result = await saveFanficAction({
        id: fanficId,
        title: story.title,
        summary: story.summary,
        coverUrl: story.coverUrl,
        musicUrl: story.musicUrl,
        musicVolume: story.musicVolume,
        visibility,
        rating: story.rating,
        warnings: story.warnings as SaveFanficInput["warnings"],
        status: story.status,
        fandomIds: story.fandoms.map((t) => t.id),
        tagIds: story.tags.map((t) => t.id),
        chapters: story.chapters.map((ch) => ({
          id: ch.id,
          title: ch.title,
          noteStart: ch.noteStart,
          noteEnd: ch.noteEnd,
          publishAt: ch.publishAt,
          pages: ch.pages.map((p) => ({ content: p.content })),
        })),
      });
    } catch {
      // Offline, or the book is bigger than the host accepts in one request.
      setSaving(null);
      setSaveError("Couldn’t reach Writt to save. Your work is still saved on this device, so check your connection and try again.");
      return;
    }
    if (!result.ok) {
      setSaving(null);
      setSaveError(result.error);
      return;
    }
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setDirty(false);
    router.push(
      visibility === "DRAFT"
        ? `/u/${username}?tab=drafts`
        : result.awaitingApproval
          ? `/fanfic/${result.id}?waiting=1`
          : `/fanfic/${result.id}${result.coins ? `?coins=${result.coins}` : ""}`,
    );
  }

  const pageCount = story.chapters.reduce((n, ch) => n + ch.pages.length, 0);
  const words = useMemo(() => story.chapters.map((ch) => ch.pages.map((p) => pageWords(p.content))), [story.chapters]);
  const chapterWords = words[loc.c]?.reduce((a, b) => a + b, 0) ?? 0;
  const bookWords = words.flat().reduce((a, b) => a + b, 0);
  const pageWordCount = words[loc.c]?.[loc.p] ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 pt-6 pb-32 sm:px-6">
      <div className="min-w-0 flex-1">
        {restorable && (
          <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-plum/30 bg-plum-soft px-4 py-3 text-sm text-plum">
            <span className="flex-1">
              You have unsaved changes on this device from {new Date(restorable.savedAt).toLocaleString()}.
            </span>
            <Button
              size="sm"
              onClick={() => {
                setStory(restorable.story);
                setActiveKey(restorable.story.chapters[0].pages[0].key);
                setRestorable(null);
                setDirty(true);
              }}
            >
              Restore
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                try {
                  localStorage.removeItem(storageKey);
                } catch {}
                setRestorable(null);
              }}
            >
              Discard
            </Button>
          </div>
        )}

        <label htmlFor="story-title" className="sr-only">
          Story title
        </label>
        <input
          id="story-title"
          value={story.title}
          onChange={(e) => update((s) => ({ ...s, title: e.target.value }))}
          placeholder="Untitled story"
          maxLength={200}
          className="w-full bg-transparent font-display text-4xl leading-tight font-semibold tracking-tight placeholder:text-ink-soft/40 focus:outline-none sm:text-5xl"
        />

        <div className="sticky top-16 z-20 -mx-2 mt-4 flex flex-wrap items-center gap-2 border-y border-line bg-paper/90 px-2 py-2 backdrop-blur">
          {editor ? <Toolbar editor={editor} onImages={(files) => void insertImages(files)} /> : <div className="h-9" />}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={addPage} title="Add a page to this chapter">
              <PlusIcon className="size-4" /> Page
            </Button>
            <Button variant="secondary" size="sm" onClick={addChapter} title="Start a new chapter">
              <PlusIcon className="size-4" /> Chapter
            </Button>
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setOutlineOpen(true)} aria-expanded={outlineOpen}>
              <ListIcon className="size-4" /> Outline
            </Button>
          </div>
        </div>

        <div className="mt-6 flex items-baseline gap-3">
          <span className="shrink-0 text-xs font-bold tracking-widest text-accent uppercase">Chapter {loc.c + 1}</span>
          <label htmlFor="chapter-title" className="sr-only">
            Chapter {loc.c + 1} title (optional)
          </label>
          <input
            id="chapter-title"
            ref={chapterTitleRef}
            value={chapter.title}
            onChange={(e) => update((s) => setChapterTitle(s, loc.c, e.target.value))}
            placeholder="Chapter title (optional)"
            maxLength={200}
            className="min-w-0 flex-1 bg-transparent font-display text-xl font-semibold placeholder:text-ink-soft/40 focus:outline-none"
          />
          <span className="shrink-0 text-xs text-ink-soft">
            Page {loc.p + 1} of {chapter.pages.length}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
          <label className="inline-flex items-center gap-2">
            <span className="font-semibold">Publish this chapter</span>
            <select
              value={chapter.publishAt ? "later" : "now"}
              onChange={(e) =>
                update((s) =>
                  setChapterField(s, loc.c, {
                    publishAt: e.target.value === "later" ? new Date(Date.now() + 24 * 60 * 60_000).toISOString() : null,
                  }),
                )
              }
              className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs"
            >
              <option value="now">with the book</option>
              <option value="later">at a set time…</option>
            </select>
          </label>
          {chapter.publishAt && (
            <label className="inline-flex items-center gap-2">
              <span className="sr-only">Publish date and time</span>
              <input
                type="datetime-local"
                value={toLocalInput(new Date(chapter.publishAt))}
                suppressHydrationWarning
                onChange={(e) => {
                  const when = e.target.value ? new Date(e.target.value) : null;
                  if (when && !Number.isNaN(when.getTime())) update((s) => setChapterField(s, loc.c, { publishAt: when.toISOString() }));
                }}
                className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs"
              />
              <span>Readers see it from then; followers get notified.</span>
            </label>
          )}
        </div>

        <NoteBox
          label="Author’s note at the start of this chapter"
          value={chapter.noteStart}
          onChange={(v) => update((s) => setChapterField(s, loc.c, { noteStart: v }))}
        />

        <div className="writt-editor mt-4 rounded-2xl border border-line bg-surface px-5 py-6 shadow-card sm:px-10 sm:py-10">
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <div className="flex min-h-[60vh] items-center justify-center">
              <Spinner label="Opening the editor…" />
            </div>
          )}
        </div>

        <NoteBox
          label="Author’s note at the end of this chapter"
          value={chapter.noteEnd}
          onChange={(v) => update((s) => setChapterField(s, loc.c, { noteEnd: v }))}
        />

        <p className="mt-3 flex flex-wrap gap-x-4 text-xs font-semibold text-ink-soft tabular-nums" aria-live="polite">
          <span>Page: {pageWordCount.toLocaleString()} words</span>
          <span>Chapter: {chapterWords.toLocaleString()}</span>
          <span>Book: {bookWords.toLocaleString()}</span>
        </p>

        {(uploads > 0 || uploadError) && (
          <div aria-live="polite" className="mt-3 text-sm">
            {uploads > 0 && <Spinner label={`Uploading ${uploads} image${uploads === 1 ? "" : "s"}…`} />}
            {uploadError && <p className="font-medium text-danger">{uploadError}</p>}
          </div>
        )}
        <p className="mt-3 text-xs text-ink-soft">Tip: drag and drop or paste pictures straight into the page.</p>
      </div>

      {/* Outline: sidebar on large screens, drawer on small ones. */}
      <aside
        className={cn(
          "w-72 shrink-0",
          outlineOpen
            ? "fixed inset-y-0 right-0 z-50 w-[min(20rem,90vw)] overflow-y-auto border-l border-line bg-paper p-4 shadow-lift"
            : "hidden lg:block",
        )}
        aria-label="Story outline and details"
      >
        <div className="space-y-6 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-1">
          {outlineOpen && (
            <div className="flex justify-end lg:hidden">
              <Button variant="ghost" size="sm" onClick={() => setOutlineOpen(false)}>
                Close
              </Button>
            </div>
          )}
          <section>
            <h2 className="mb-3 text-xs font-bold tracking-widest text-ink-soft uppercase">
              Outline · {story.chapters.length} ch · {pageCount} pp
            </h2>
            <Outline
              story={story}
              active={loc}
              onOpen={open}
              onMoveChapter={(c, d) => update((s) => moveChapter(s, c, d))}
              onDeleteChapter={removeChapter}
              onMovePage={(l, d) => update((s) => movePage(s, l, d))}
              onDeletePage={removePage}
            />
          </section>
          <section>
            <h2 className="mb-3 text-xs font-bold tracking-widest text-ink-soft uppercase">Publishing</h2>
            <PublishingPanel story={story} allowedRatings={rules?.allowedRatings} onChange={(patch) => update((s) => ({ ...s, ...patch }))} />
          </section>
          <section>
            <h2 className="mb-3 text-xs font-bold tracking-widest text-ink-soft uppercase">Cover &amp; music</h2>
            <DetailsPanel story={story} onChange={(patch) => update((s) => ({ ...s, ...patch }))} />
          </section>
        </div>
      </aside>
      {outlineOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOutlineOpen(false)} aria-hidden />}

      {/* Done: fixed to the very bottom-left. */}
      <div className="fixed bottom-4 left-4 z-30 flex items-center gap-3">
        <Button size="lg" onClick={() => setDoneOpen(true)} className="shadow-lift">
          Done
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => {
            setSaveError(null);
            setDraftOpen(true);
          }}
          className="shadow-lift"
        >
          Draft
        </Button>
        <span className="hidden rounded-full bg-surface/90 px-3 py-1 text-xs text-ink-soft shadow-card sm:inline" aria-live="polite">
          {savedLocallyAt ? `Saved on this device · ${new Date(savedLocallyAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Autosaves on this device"}
        </span>
      </div>

      <DraftConfirmDialog
        open={draftOpen}
        onCancel={() => setDraftOpen(false)}
        onConfirm={() => void save("DRAFT")}
        saving={saving === "DRAFT"}
        error={saveError}
        current={currentVisibility}
      />
      <DoneDialog
        open={doneOpen}
        onClose={() => setDoneOpen(false)}
        onChoose={(v) => void save(v)}
        saving={saving}
        error={saveError}
        current={currentVisibility}
        rules={rules}
      />
    </div>
  );
}

/** "YYYY-MM-DDTHH:mm" in the browser's time zone, for datetime-local inputs. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Collapsible author's note; opens by itself when it already has text. */
function NoteBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <details className="group mt-3 rounded-xl border border-dashed border-line bg-surface/60 px-4 py-2" open={value.length > 0 || undefined}>
      <summary className="cursor-pointer text-xs font-semibold text-ink-soft select-none group-open:mb-2">
        {value ? label : `+ ${label}`}
      </summary>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, NOTE_MAX))}
        rows={3}
        aria-label={label}
        placeholder="Thanks for reading! Shown in a box in the reader."
        className="w-full resize-y bg-transparent font-read text-sm focus:outline-none"
      />
    </details>
  );
}
