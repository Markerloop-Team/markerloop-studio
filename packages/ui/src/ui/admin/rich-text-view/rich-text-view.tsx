"use client";

import * as React from "react";

import { cn } from "../../internal/utils/cn";

/**
 * Read-only renderer for `rich_text` values in the `pm/1` format (SDL-638).
 *
 * The canonical schema lives in go-sdk: `pkg/richtext/schema.go` (nodes,
 * marks, attrs) and `pkg/richtext/html.go` (the reference HTML renderer).
 * This component mirrors that renderer's tag choice and mark nesting order,
 * with two deliberate differences, both on the side of "never break the
 * screen":
 *
 *  - The Go renderer REJECTS a document with an unknown node or mark. Here
 *    an unknown node renders its children (or its text), an unknown mark is
 *    dropped, a malformed attr falls back — an admin screen must not go
 *    blank because the server's schema grew a node this build does not know.
 *  - A link whose href fails the scheme allowlist renders as plain text,
 *    never as an `<a>`. The server refuses such links on write, but a
 *    renderer must not trust that the tree came through the validator (the
 *    reason `html.go` re-checks the scheme too).
 *
 * The value is typed `unknown` on purpose: it comes off the wire.
 */

/** Schemes allowed in `href` — go-sdk `richtext.DefaultLinkSchemes`. */
export const RICH_TEXT_LINK_SCHEMES: readonly string[] = ["http", "https", "mailto"];

/** go-sdk `maxHrefLen`. */
const MAX_HREF_LEN = 2048;

/**
 * Nesting cap. The server caps documents at depth 20 (`DefaultMaxDepth`);
 * anything deeper did not come from it, and recursing into it unbounded
 * is how a hostile value would take the tab down.
 */
const MAX_DEPTH = 64;

/** Whether `href` is an absolute URL with an allowed scheme (go-sdk `hrefAttr`). */
export function isAllowedRichTextHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  if (href === "" || href.length > MAX_HREF_LEN) return false;
  // Control characters ("java\u0000script:", newlines) are the classic way
  // around prefix checks; the WHATWG parser would silently strip some of
  // them, so refuse before parsing. Surrounding whitespace likewise.
  for (let i = 0; i < href.length; i++) {
    const c = href.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
  }
  if (href.trim() !== href) return false;
  // Scheme as written, not as normalised by a parser: relative links have
  // none and are refused (the canon does not know what they are relative to).
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(href);
  if (!match) return false;
  const scheme = match[1].toLowerCase();
  if (!RICH_TEXT_LINK_SCHEMES.includes(scheme)) return false;
  try {
    // Parity with net/url: an unparsable URL is refused too.
    new URL(href);
  } catch {
    return false;
  }
  return true;
}

// ---- tree access -------------------------------------------------------

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function childrenOf(node: Obj): unknown[] {
  return Array.isArray(node.content) ? node.content : [];
}

function attrsOf(node: Obj): Obj {
  return isObj(node.attrs) ? node.attrs : {};
}

function intAttr(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

/**
 * Accepts either the bare ProseMirror doc or the whole `{format, doc, text}`
 * envelope, so a caller holding the field value does not have to unwrap it.
 */
function docOf(value: unknown): Obj | null {
  if (!isObj(value)) return null;
  if (value.type === undefined && isObj(value.doc)) return value.doc;
  return value;
}

// ---- marks -------------------------------------------------------------

/** go-sdk markSpecs rank: lower = outer. */
const MARK_RANK: Record<string, number> = {
  link: 0,
  bold: 1,
  italic: 2,
  underline: 3,
  strike: 4,
  code: 5,
};

function renderText(node: Obj, key: React.Key): React.ReactNode {
  const text = typeof node.text === "string" ? node.text : "";
  if (text === "") return null;
  // Own keys only: `in` would let "constructor"/"__proto__" through and
  // sort by NaN. One mark per type: two link marks would nest <a> in <a>
  // (the canon's Sanitize drops duplicates; the view must not rely on it).
  const seen = new Set<string>();
  const marks = (Array.isArray(node.marks) ? node.marks : [])
    .filter(isObj)
    .filter((m) => {
      if (typeof m.type !== "string" || !Object.hasOwn(MARK_RANK, m.type)) return false;
      if (seen.has(m.type)) return false;
      seen.add(m.type);
      return true;
    })
    .sort((a, b) => MARK_RANK[a.type as string] - MARK_RANK[b.type as string]);

  // Wrap from the innermost mark outwards.
  let out: React.ReactNode = text;
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i];
    switch (mark.type) {
      case "bold":
        out = <strong>{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "underline":
        out = <u>{out}</u>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "code":
        out = (
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">{out}</code>
        );
        break;
      case "link": {
        const attrs = attrsOf(mark);
        const title = typeof attrs.title === "string" && attrs.title !== "" ? attrs.title : undefined;
        out = isAllowedRichTextHref(attrs.href) ? (
          <a
            href={attrs.href}
            title={title}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {out}
          </a>
        ) : (
          // Refused scheme: the words stay, the link does not.
          <span data-rich-text-link-rejected="">{out}</span>
        );
        break;
      }
    }
  }
  return <React.Fragment key={key}>{out}</React.Fragment>;
}

// ---- nodes -------------------------------------------------------------

const HEADING_CLASS: Record<number, string> = {
  1: "text-xl font-semibold",
  2: "text-lg font-semibold",
  3: "text-base font-semibold",
  4: "text-sm font-semibold",
  5: "text-sm font-semibold",
  6: "text-sm font-semibold",
};

function renderChildren(node: Obj, depth: number): React.ReactNode[] {
  return childrenOf(node).map((child, i) => renderNode(child, i, depth + 1));
}

function renderNode(value: unknown, key: React.Key, depth: number): React.ReactNode {
  if (!isObj(value) || depth > MAX_DEPTH) return null;

  switch (value.type) {
    case "text":
      return renderText(value, key);

    case "hardBreak":
      return <br key={key} />;

    case "horizontalRule":
      return <hr key={key} className="border-border my-3" />;

    case "doc":
      return <React.Fragment key={key}>{renderChildren(value, depth)}</React.Fragment>;

    case "paragraph":
      return <p key={key}>{renderChildren(value, depth)}</p>;

    case "heading": {
      const raw = intAttr(attrsOf(value).level);
      // A heading without a valid level is still a heading-shaped line of
      // text; showing its words beats refusing the document as html.go does.
      const level = raw !== null && raw >= 1 && raw <= 6 ? raw : 2;
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag key={key} className={HEADING_CLASS[level]}>
          {renderChildren(value, depth)}
        </Tag>
      );
    }

    case "bulletList":
      return (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {renderChildren(value, depth)}
        </ul>
      );

    case "orderedList": {
      const start = intAttr(attrsOf(value).start);
      return (
        <ol
          key={key}
          start={start !== null && start > 1 ? start : undefined}
          className="list-decimal space-y-1 pl-5"
        >
          {renderChildren(value, depth)}
        </ol>
      );
    }

    case "listItem":
      return (
        <li key={key} className="space-y-1">
          {renderChildren(value, depth)}
        </li>
      );

    case "blockquote":
      return (
        <blockquote
          key={key}
          className="border-border text-muted-foreground space-y-2 border-l-2 pl-3"
        >
          {renderChildren(value, depth)}
        </blockquote>
      );

    case "codeBlock": {
      // Marks are forbidden inside a code block by the canon: text only.
      const text = childrenOf(value)
        .map((c) => (isObj(c) && typeof c.text === "string" ? c.text : ""))
        .join("");
      const lang = attrsOf(value).language;
      return (
        <pre
          key={key}
          className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs leading-relaxed"
        >
          <code
            className={
              typeof lang === "string" && /^[A-Za-z0-9._:+#-]{1,32}$/.test(lang)
                ? `language-${lang}`
                : undefined
            }
          >
            {text}
          </code>
        </pre>
      );
    }

    case "image": {
      // No asset resolver here: the admin shows WHERE the picture is, not the
      // picture. `src`/`url` attrs are forbidden by the canon and ignored.
      const attrs = attrsOf(value);
      const label =
        (typeof attrs.alt === "string" && attrs.alt) ||
        (typeof attrs.asset_id === "string" && attrs.asset_id) ||
        "image";
      return (
        <span
          key={key}
          data-rich-text-image=""
          data-asset-id={typeof attrs.asset_id === "string" ? attrs.asset_id : undefined}
          className="border-border text-muted-foreground inline-block rounded border px-1.5 py-0.5 text-xs"
        >
          [{label}]
        </span>
      );
    }

    default: {
      // Unknown node: degrade to its content, then to its text.
      if (Array.isArray(value.content)) {
        return <React.Fragment key={key}>{renderChildren(value, depth)}</React.Fragment>;
      }
      if (typeof value.text === "string") {
        return <React.Fragment key={key}>{value.text}</React.Fragment>;
      }
      return null;
    }
  }
}

/** True when the document has nothing to show. */
function isEmptyDoc(doc: Obj | null): boolean {
  if (!doc) return true;
  const walk = (n: unknown, depth: number): boolean => {
    if (!isObj(n) || depth > MAX_DEPTH) return true;
    if (n.type === "text") return typeof n.text !== "string" || n.text === "";
    if (n.type === "image" || n.type === "horizontalRule") return false;
    return childrenOf(n).every((c) => walk(c, depth + 1));
  };
  return walk(doc, 0);
}

/**
 * Whether the document carries anything a plain-text editor cannot keep:
 * a node other than paragraph/text, more than one paragraph, or any mark.
 * The admin's rich_text input edits `text` and writes it back as a single
 * unmarked paragraph, so `true` here means "saving through it loses
 * formatting".
 */
export function richTextHasFormatting(value: unknown): boolean {
  const doc = docOf(value);
  if (!doc) return false;
  const blocks = childrenOf(doc);
  if (blocks.length > 1) return true;
  for (const block of blocks) {
    if (!isObj(block) || block.type !== "paragraph") return true;
    for (const inline of childrenOf(block)) {
      if (!isObj(inline) || inline.type !== "text") return true;
      if (Array.isArray(inline.marks) && inline.marks.length > 0) return true;
    }
  }
  return false;
}

export type RichTextViewProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** A `pm/1` document, or the whole `{format, doc, text}` envelope. */
  value: unknown;
  /** Rendered when the document is absent or has nothing to show. */
  empty?: React.ReactNode;
};

/**
 * Read-only view of a `pm/1` rich text document: paragraphs, headings,
 * lists, blockquote, code (block and inline), links, bold/italic/underline/
 * strike, hard breaks, rules. Never throws on a malformed value.
 */
export function RichTextView({ value, empty = null, className, ...props }: RichTextViewProps) {
  const doc = docOf(value);
  if (isEmptyDoc(doc)) return <>{empty}</>;
  return (
    <div
      data-slot="rich-text-view"
      className={cn("text-foreground space-y-2 text-sm leading-relaxed break-words", className)}
      {...props}
    >
      {renderNode(doc, "doc", 0)}
    </div>
  );
}
