// References from a page to the workspace's file library (SDL-624).
//
// A picture on a page is not an address, it is a FILE of the shared library:
// the schema stores `mlfile:<uuid>` and the host resolves it to a URL at
// render time (`SaunaContext.file`). The prefix is the whole design — the
// body is an opaque jsonb to pages-service, and a prefix lets the server find
// every reference by walking strings, knowing nothing about the catalog,
// variants or params. A bare UUID typed into a Text is NOT a reference.
//
// The same rules live in Go (`pages-service/internal/filerefs`); the two are
// held together by one fixture, `test/fixtures/file-refs.cases.json`, copied
// verbatim into both repositories (no cross-service imports).
//
// Pure and server-safe, like the rest of `core`: no React, no DOM, no I/O.

import type { SaunaSchema } from "../schema/types";

/** The prefix that turns a file id into a reference. */
export const FILE_REF_PREFIX = "mlfile:";

/**
 * Prop keys that carry a media address. Only these are held to
 * {@link isAllowedMediaSrc}; a `Link.href` of `/about` is a site path, not a
 * file path, and is none of this module's business.
 */
export const MEDIA_PROP_KEYS: readonly string[] = ["src"];

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `mlfile:<id>` for a file id. */
export function toFileRef(id: string): string {
  return `${FILE_REF_PREFIX}${id}`;
}

/**
 * The file id a value references, lowercase, or `null` when the value is not
 * a reference. Strict: the WHOLE value must be the prefix followed by a
 * 36-character UUID — `mlfile:not-a-uuid`, a bare UUID and a reference buried
 * in a sentence all read as "not a reference".
 */
export function parseFileRef(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(FILE_REF_PREFIX)) return null;
  const id = value.slice(FILE_REF_PREFIX.length);
  if (id.length !== 36 || !UUID_RE.test(id)) return null;
  const lower = id.toLowerCase();
  // The nil UUID is not a file id anywhere (the server rejects it too).
  return lower === NIL_UUID ? null : lower;
}

/**
 * Every file id a schema references, deduped, in order of appearance.
 *
 * Deliberately blind to structure: it walks EVERY string in the document —
 * node props, `variants[].props`, the `params` of a `Ref` node, nested arrays
 * and objects — because that is what the server does, and the two must agree
 * on what a page references. Context-blind too, like `collectRefBlockIds`: a
 * variant that only shows for logged-in visitors still references its file.
 */
export function collectFileRefs(schema: SaunaSchema): string[] {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      const id = parseFileRef(value);
      if (id !== null) found.add(id);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(walk);
    }
  };
  walk(schema);
  return [...found];
}

/**
 * May this value sit under a media prop key (`src`)?
 *
 * Allowed: absent (`undefined`), `""` (no picture yet), a file reference, and
 * an `https://` address — somebody else's hosting is not a file path and the
 * decision in `pages.md` is about storage on OUR side. Refused: `/x.png` and
 * `img/x.png` (a path into whatever host renders the node — works in one app,
 * broken in every other), `data:` (a file smuggled into the body), `//host`
 * and `http://` (mixed content on a published page), and a broken `mlfile:`.
 */
export function isAllowedMediaSrc(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;
  if (value === "") return true;
  if (value.startsWith(FILE_REF_PREFIX)) return parseFileRef(value) !== null;
  return value.startsWith("https://");
}

export type FilePathProp = {
  nodeId: string;
  /** RFC 6901 JSON pointer within the schema document, e.g. `/nodes/img/props/src`. */
  pointer: string;
  value: string;
};

function escapePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Every string under a media prop key that {@link isAllowedMediaSrc} refuses.
 *
 * Looks at the key `src` at ANY depth of a node's `props` and of each
 * `variants[].props` — which covers the `params` of a `Ref` node, since they
 * live in its props. Only strings are checked: a non-string `src` is a schema
 * error, not a file path, and is somebody else's to refuse. The pointer names
 * the exact value, so the server's 422 can point the author at it.
 */
export function findFilePathProps(schema: SaunaSchema): FilePathProp[] {
  const out: FilePathProp[] = [];
  const walk = (nodeId: string, pointer: string, key: string | null, value: unknown): void => {
    if (typeof value === "string") {
      if (key !== null && MEDIA_PROP_KEYS.includes(key) && !isAllowedMediaSrc(value)) {
        out.push({ nodeId, pointer, value });
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(nodeId, `${pointer}/${i}`, null, v));
    } else if (typeof value === "object" && value !== null) {
      for (const [k, v] of Object.entries(value)) walk(nodeId, `${pointer}/${escapePointerToken(k)}`, k, v);
    }
  };
  for (const [nodeId, node] of Object.entries(schema.nodes)) {
    const base = `/nodes/${escapePointerToken(nodeId)}`;
    walk(nodeId, `${base}/props`, null, node.props);
    (node.variants ?? []).forEach((variant, i) => walk(nodeId, `${base}/variants/${i}/props`, null, variant.props));
  }
  return out;
}
