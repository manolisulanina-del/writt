import Image from "next/image";
import type { ReactNode } from "react";
import { safeLinkHref, sanitizeDoc, type RichMark, type RichNode } from "@/lib/rich-text";

// Renders stored story JSON as React elements. Content is re-sanitized here as
// a second line of defense, and React escapes all text, so no raw HTML is used.

function applyMarks(text: ReactNode, marks: RichMark[] = [], key: string): ReactNode {
  return marks.reduce<ReactNode>((child, mark, i) => {
    const k = `${key}-${i}`;
    switch (mark.type) {
      case "bold":
        return <strong key={k}>{child}</strong>;
      case "italic":
        return <em key={k}>{child}</em>;
      case "underline":
        return <u key={k}>{child}</u>;
      case "strike":
        return <s key={k}>{child}</s>;
      case "code":
        return <code key={k}>{child}</code>;
      case "link": {
        const href = safeLinkHref(mark.attrs?.href);
        return href ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
            {child}
          </a>
        ) : (
          child
        );
      }
      default:
        return child;
    }
  }, text);
}

function renderNodes(nodes: RichNode[] | undefined, key: string): ReactNode[] {
  return (nodes ?? []).map((node, i) => renderNode(node, `${key}.${i}`));
}

function renderNode(node: RichNode, key: string): ReactNode {
  const children = renderNodes(node.content, key);
  switch (node.type) {
    case "text":
      return applyMarks(node.text, node.marks, key);
    case "hardBreak":
      return <br key={key} />;
    case "paragraph":
      return <p key={key}>{children.length ? children : <br />}</p>;
    case "heading":
      return node.attrs?.level === 3 ? <h3 key={key}>{children}</h3> : <h2 key={key}>{children}</h2>;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={Number(node.attrs?.start) || 1}>
          {children}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children}</li>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "image": {
      const src = String(node.attrs?.src ?? "");
      const alt = String(node.attrs?.alt ?? "");
      return (
        <figure key={key}>
          <Image src={src} alt={alt} width={1200} height={800} unoptimized className="h-auto w-auto" />
        </figure>
      );
    }
    default:
      return null;
  }
}

export function RichText({ doc }: { doc: unknown }) {
  const clean = sanitizeDoc(doc);
  return <div className="prose-writt">{renderNodes(clean.content, "n")}</div>;
}
