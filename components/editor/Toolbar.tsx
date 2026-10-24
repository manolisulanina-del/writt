"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ACCEPTED_IMAGES } from "@/lib/upload-client";
import { ImageIcon, LinkIcon } from "@/components/ui/icons";

function ToolButton({
  label,
  active,
  onClick,
  children,
  disabled,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold transition disabled:opacity-40",
        active ? "bg-ink text-paper" : "text-ink-soft hover:bg-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-6 w-px bg-line" aria-hidden />;

export function Toolbar({ editor, onImages }: { editor: Editor; onImages: (files: File[]) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      quote: e.isActive("blockquote"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      link: e.isActive("link"),
      image: e.isActive("image"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  function editLink() {
    if (s.link) {
      chain().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = window.prompt("Link address (https://…)");
    if (!href) return;
    try {
      const url = new URL(href);
      if (!["http:", "https:", "mailto:"].includes(url.protocol)) throw new Error();
      chain().extendMarkRange("link").setLink({ href: url.toString() }).run();
    } catch {
      window.alert("Use a full link starting with https://");
    }
  }

  function editAlt() {
    const current = (editor.getAttributes("image").alt as string | undefined) ?? "";
    const alt = window.prompt("Describe this image for people using screen readers:", current);
    if (alt !== null) chain().updateAttributes("image", { alt: alt.slice(0, 300) }).run();
  }

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
      <ToolButton label="Bold" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <b>B</b>
      </ToolButton>
      <ToolButton label="Italic" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <i className="font-read">I</i>
      </ToolButton>
      <ToolButton label="Underline" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <u>U</u>
      </ToolButton>
      <ToolButton label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <s>S</s>
      </ToolButton>
      <Sep />
      <ToolButton label="Heading" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolButton>
      <ToolButton label="Subheading" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolButton>
      <ToolButton label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <span className="font-display text-lg leading-none">“</span>
      </ToolButton>
      <ToolButton label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        •≡
      </ToolButton>
      <ToolButton label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        1≡
      </ToolButton>
      <ToolButton label="Scene break" onClick={() => chain().setHorizontalRule().run()}>
        ✦
      </ToolButton>
      <Sep />
      <ToolButton label={s.link ? "Remove link" : "Add link"} active={s.link} onClick={editLink}>
        <LinkIcon className="size-4" />
      </ToolButton>
      <ToolButton label="Insert picture" onClick={() => fileInput.current?.click()}>
        <ImageIcon className="size-4" />
      </ToolButton>
      {s.image && (
        <ToolButton label="Edit image description (alt text)" onClick={editAlt}>
          Alt
        </ToolButton>
      )}
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_IMAGES}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onImages(files);
        }}
      />
      <Sep />
      <ToolButton label="Undo" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        ↶
      </ToolButton>
      <ToolButton label="Redo" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        ↷
      </ToolButton>
    </div>
  );
}
