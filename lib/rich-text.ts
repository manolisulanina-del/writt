// Story page content is Tiptap/ProseMirror JSON. Everything stored passes
// through sanitizeDoc(), an allowlist of node types, marks and attributes, and
// is rendered by components/reader/RichText.tsx as React elements (never raw
// HTML), so stored content can't inject markup or script.
import { isStorageUrl } from "@/lib/storage/types";

export type RichMark = { type: string; attrs?: Record<string, unknown> };
export type RichNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: RichMark[];
  text?: string;
};
export type RichDoc = { type: "doc"; content: RichNode[] };

export const EMPTY_DOC: RichDoc = { type: "doc", content: [{ type: "paragraph" }] };

const BLOCK_CHILDREN: Record<string, readonly string[]> = {
  doc: ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "codeBlock", "horizontalRule", "image"],
  blockquote: ["paragraph", "heading", "bulletList", "orderedList", "image"],
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  listItem: ["paragraph", "bulletList", "orderedList"],
};
const INLINE_PARENTS = new Set(["paragraph", "heading", "codeBlock"]);
const MARKS = new Set(["bold", "italic", "underline", "strike", "code", "link"]);

const MAX_DEPTH = 20;

export function safeLinkHref(href: unknown): string | null {
  if (typeof href !== "string" || href.length > 2000) return null;
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function sanitizeMarks(marks: unknown, allowAll: boolean): RichMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: RichMark[] = [];
  for (const mark of marks) {
    if (!mark || typeof mark !== "object") continue;
    const type = (mark as RichMark).type;
    if (!MARKS.has(type) || (!allowAll && type !== "code")) continue;
    if (type === "link") {
      const href = safeLinkHref((mark as RichMark).attrs?.href);
      if (href) out.push({ type, attrs: { href } });
    } else {
      out.push({ type });
    }
  }
  return out.length ? out : undefined;
}

function sanitizeInline(nodes: unknown, parent: string): RichNode[] {
  if (!Array.isArray(nodes)) return [];
  const out: RichNode[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as RichNode;
    if (n.type === "text" && typeof n.text === "string" && n.text.length > 0) {
      const marks = sanitizeMarks(n.marks, parent !== "codeBlock");
      out.push(marks ? { type: "text", text: n.text, marks } : { type: "text", text: n.text });
    } else if (n.type === "hardBreak" && parent !== "codeBlock") {
      out.push({ type: "hardBreak" });
    }
  }
  return out;
}

function sanitizeBlock(node: RichNode, depth: number): RichNode | null {
  switch (node.type) {
    case "paragraph":
    case "codeBlock": {
      const content = sanitizeInline(node.content, node.type);
      return content.length ? { type: node.type, content } : { type: node.type };
    }
    case "heading": {
      const raw = Number(node.attrs?.level);
      const level = raw === 2 || raw === 3 ? raw : 2;
      const content = sanitizeInline(node.content, "heading");
      return content.length ? { type: "heading", attrs: { level }, content } : { type: "heading", attrs: { level } };
    }
    case "horizontalRule":
      return { type: "horizontalRule" };
    case "image": {
      const src = node.attrs?.src;
      if (typeof src !== "string" || !isStorageUrl(src)) return null;
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt.slice(0, 300) : "";
      return { type: "image", attrs: { src, alt } };
    }
    case "blockquote":
    case "bulletList":
    case "orderedList":
    case "listItem": {
      const content = sanitizeChildren(node.type, node.content, depth + 1);
      if (!content.length) return null;
      if (node.type === "orderedList") {
        const start = Number(node.attrs?.start);
        return {
          type: "orderedList",
          attrs: { start: Number.isInteger(start) && start > 0 && start < 100000 ? start : 1 },
          content,
        };
      }
      return { type: node.type, content };
    }
    default:
      return null;
  }
}

function sanitizeChildren(parent: string, nodes: unknown, depth: number): RichNode[] {
  if (!Array.isArray(nodes) || depth > MAX_DEPTH) return [];
  const allowed = BLOCK_CHILDREN[parent] ?? [];
  const out: RichNode[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as RichNode;
    if (!allowed.includes(n.type)) {
      // Keep the text of disallowed wrappers rather than dropping it silently.
      if (n.type !== "text" && Array.isArray(n.content) && !INLINE_PARENTS.has(n.type)) {
        out.push(...sanitizeChildren(parent, n.content, depth + 1));
      }
      continue;
    }
    const clean = sanitizeBlock(n, depth);
    if (clean) out.push(clean);
  }
  return out;
}

/** Returns a safe copy of an untrusted document. Unknown content is removed. */
export function sanitizeDoc(input: unknown): RichDoc {
  if (!input || typeof input !== "object" || (input as RichNode).type !== "doc") return EMPTY_DOC;
  const content = sanitizeChildren("doc", (input as RichNode).content, 0);
  return { type: "doc", content: content.length ? content : EMPTY_DOC.content };
}

/** Plain text of a document, with blocks separated by spaces. */
export function docText(doc: RichDoc | RichNode): string {
  const parts: string[] = [];
  const walk = (node: RichNode) => {
    if (node.type === "text" && node.text) parts.push(node.text);
    else if (node.type === "hardBreak") parts.push(" ");
    node.content?.forEach(walk);
    if (node.type !== "text" && node.type !== "doc") parts.push(" ");
  };
  walk(doc);
  return parts.join("").replace(/\s+/g, " ").trim();
}

export function excerptOf(doc: RichDoc, length = 220): string {
  const text = docText(doc);
  if (text.length <= length) return text;
  const cut = text.slice(0, length);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), length - 30)).trimEnd()}…`;
}

export function isDocEmpty(doc: RichDoc): boolean {
  return docText(doc).length === 0 && !JSON.stringify(doc).includes('"image"');
}
