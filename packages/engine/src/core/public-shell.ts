// The public shell of a page (SDL-632).
//
// What an anonymous visitor may receive: the document with every private
// node cut out together with its subtree, and with the member branch of every
// hybrid node stripped, so the body is the same for every guest and can be
// cached and ETagged as one object.
//
// pages-service does this in Go before the public plane signs file URLs and
// computes the ETag (S4, `internal/shell`). The two are held to one contract
// by `test/fixtures/visibility-shell.cases.json`, which pages-service copies
// verbatim — edit the fixture here, copy it there.
//
// Pure and server-safe: no React, no DOM, no I/O. Never mutates its input.

import type { SaunaAnySchema, SaunaNodeConfig, SaunaNodeId, SaunaNodeV1, SaunaSchema } from "../schema/types";
import { isSaunaVisibilityMode } from "./visibility-mode";

/**
 * Is this node cut out of the shell by its OWN `visibility`? Private is, and
 * so is every value that is neither a mode, nor the legacy object rule, nor
 * absent: the renderer hides such a node (fail closed), so the shell must not
 * ship it to a visitor either. The legacy object rule is presentation, not
 * access control, and stays in — the public plane has always served it.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cutsOwnSubtree(node: SaunaNodeConfig): boolean {
  const v: unknown = node.visibility;
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return !isSaunaVisibilityMode(v) || v === "private";
  if (typeof v === "object" && !Array.isArray(v)) return false;
  return true;
}

/** Child ids of a node along BOTH paths: `children` and every `variants[].children`. */
function childIdsOf(node: SaunaNodeConfig): SaunaNodeId[] {
  const out: SaunaNodeId[] = [];
  if (Array.isArray(node.children)) out.push(...node.children);
  if (Array.isArray(node.variants)) {
    for (const variant of node.variants) {
      if (variant && Array.isArray(variant.children)) out.push(...variant.children);
    }
  }
  return out;
}

/**
 * Ids `saunaPublicShell` removes: every node that cuts its own subtree, its
 * descendants through `children` and `variants[].children`, and — as a safety
 * net for hand-written documents — any node whose `parents` chain leads into
 * that set.
 */
export function saunaPrivateNodeIds(schema: SaunaSchema): Set<SaunaNodeId> {
  const removed = new Set<SaunaNodeId>();
  const nodes = schema.nodes ?? {};
  // The `parents` map inverted ONCE (parent → children), so the sweep below is
  // one linear walk. The earlier "loop until nothing grows" rescan of the
  // whole map was quadratic in the chain length: 50k hand-written nodes in a
  // chain took a minute per anonymous GET (S4 review).
  const byParent = new Map<SaunaNodeId, SaunaNodeId[]>();
  for (const [id, parent] of Object.entries(schema.parents ?? {})) {
    if (parent == null) continue;
    const list = byParent.get(parent);
    if (list) list.push(id);
    else byParent.set(parent, [id]);
  }
  const stack: SaunaNodeId[] = [];
  for (const [id, node] of Object.entries(nodes)) {
    if (node && cutsOwnSubtree(node)) stack.push(id);
  }
  while (stack.length) {
    const id = stack.pop()!;
    if (removed.has(id)) continue;
    removed.add(id);
    const node = nodes[id];
    if (node) stack.push(...childIdsOf(node));
    const viaParents = byParent.get(id);
    if (viaParents) stack.push(...viaParents);
  }
  return removed;
}

/**
 * The v1 tree (`{ version: 1, root }`) cut the same way: a node that cuts its
 * own subtree is dropped from its parent's `children` with everything below
 * it, `member` is removed from every node, and a cut ROOT is reduced to
 * `{ type }` — the same answer the v2 shell gives a private root. The engine
 * still reads v1 (`migrateSaunaSchema` carries `visibility` over), so a v1
 * document with a private node is a working closed page for it, and the
 * shell must not ship that node to a visitor (S4 review, blocker 1).
 */
function publicShellV1(node: SaunaNodeV1): SaunaNodeV1 {
  if (cutsOwnSubtree(node as SaunaNodeConfig)) return { type: node.type };
  return stripV1(node);
}

function stripV1(node: SaunaNodeV1): SaunaNodeV1 {
  const { member: _member, ...rest } = node as SaunaNodeV1 & { member?: unknown };
  void _member;
  const next: SaunaNodeV1 = { ...rest };
  if (Array.isArray(node.children)) {
    next.children = node.children
      .filter((child) => !(child && typeof child === "object" && cutsOwnSubtree(child as SaunaNodeConfig)))
      .map((child) => (child && typeof child === "object" ? stripV1(child) : child));
  }
  return next;
}

/**
 * The document as an anonymous visitor may receive it:
 *
 *  - a node that is `"private"` (or carries a `visibility` that is neither a
 *    mode nor the legacy rule) is removed with its whole subtree — from
 *    `nodes`, from `parents`, from every surviving `children[]` and
 *    `variants[].children`;
 *  - `member` is removed from every node, so a hybrid node carries its guest
 *    branch only;
 *  - `params` specs pointing at a removed node are removed (the key itself
 *    stays, possibly empty, when the document had it) — a spec that was an
 *    orphan before the cut is the author's to see and stays.
 *
 * Nothing else changes: the shell of a document with no private node is the
 * document minus `member`, byte for byte in every other field.
 *
 * A private ROOT cannot be removed — the document would have no root. It is
 * reduced to `{ type }` with no props and no children: the visitor gets an
 * empty page, never the content. pages-service refuses to store a non-public
 * root (422), so this is the answer for a document that got there anyway.
 *
 * A v1 document (`{ version: 1, root }`) is cut along its `root` tree by the
 * same rules; a document carrying both `root` and `nodes` has both cut. A
 * document with `nodes` but no `parents` gets no `parents` invented.
 */
export function saunaPublicShell(schema: SaunaSchema): SaunaSchema;
export function saunaPublicShell(schema: SaunaAnySchema): SaunaAnySchema;
export function saunaPublicShell(schema: SaunaAnySchema): SaunaAnySchema {
  // Both representations are cut whenever they are PRESENT, regardless of
  // `version`: a document carrying `root` and `nodes` at once is drawn from
  // `root` by this engine and cut by `nodes` in pages-service, so cutting one
  // of them would leave the other for a visitor.
  const withRoot = schema as SaunaAnySchema & { root?: SaunaNodeV1; nodes?: unknown; parents?: unknown };
  const hasRoot = !!withRoot.root && typeof withRoot.root === "object";
  // `nodes` (or `parents`) present but not a plain object — an array, a
  // string: the renderer would still draw an array by index, so the shell
  // does not cut "by index" but drops both keys. A visitor gets no nodes at
  // all (fail closed); the validator refuses such a document on write.
  const malformed = (withRoot.nodes !== undefined && !isPlainObject(withRoot.nodes)) ||
    (withRoot.parents !== undefined && !isPlainObject(withRoot.parents));
  if (malformed) {
    const { nodes: _n, parents: _p, ...rest } = withRoot;
    void _n; void _p;
    return (hasRoot ? { ...rest, root: publicShellV1(withRoot.root!) } : rest) as SaunaAnySchema;
  }
  const hasNodes = withRoot.nodes !== undefined;
  if (!hasNodes) {
    return hasRoot ? ({ ...schema, root: publicShellV1(withRoot.root!) } as SaunaAnySchema) : schema;
  }
  const v2 = publicShellV2(schema as SaunaSchema);
  return hasRoot ? ({ ...v2, root: publicShellV1(withRoot.root!) } as SaunaAnySchema) : v2;
}

function publicShellV2(schema: SaunaSchema): SaunaSchema {
  const removed = saunaPrivateNodeIds(schema);
  const rootCut = removed.has(schema.rootId);
  if (rootCut) removed.delete(schema.rootId);

  const keep = (ids: SaunaNodeId[]) => ids.filter((id) => !removed.has(id));

  const nodes: Record<SaunaNodeId, SaunaNodeConfig> = {};
  for (const [id, node] of Object.entries(schema.nodes)) {
    if (removed.has(id)) continue;
    if (rootCut && id === schema.rootId) {
      nodes[id] = { type: node.type };
      continue;
    }
    const { member: _member, ...rest } = node;
    void _member;
    const next: SaunaNodeConfig = { ...rest };
    if (Array.isArray(node.children)) next.children = keep(node.children);
    if (Array.isArray(node.variants)) {
      next.variants = node.variants.map((variant) =>
        variant && Array.isArray(variant.children) ? { ...variant, children: keep(variant.children) } : variant,
      );
    }
    nodes[id] = next;
  }

  const shell: SaunaSchema = { ...schema, nodes };
  // `parents` is filtered when the document has it and NOT invented when it
  // does not: the shell of a document is the document minus what is cut, and
  // pages-service holds the same line (it never adds keys to a stored body).
  if (schema.parents && typeof schema.parents === "object") {
    const parents: Record<SaunaNodeId, SaunaNodeId | null> = {};
    for (const [id, parent] of Object.entries(schema.parents)) {
      if (removed.has(id)) continue;
      parents[id] = parent;
    }
    shell.parents = parents;
  }
  if (Array.isArray(schema.params)) {
    shell.params = schema.params.filter((spec) => !(spec && typeof spec.nodeId === "string" && removed.has(spec.nodeId)));
  }
  return shell;
}

/**
 * How much of a node an anonymous, shared cache may hold:
 *
 *  - `"none"`         — the node, or an ancestor, is cut out of the shell
 *    (private or malformed `visibility`); nothing of it is public;
 *  - `"guest-branch"` — the mode in force is hybrid: the shell holds the guest
 *    values, a member's values come from elsewhere;
 *  - `"full"`         — public, legacy rule or no `visibility` at all: the
 *    shell holds exactly what everyone sees.
 *
 * An unknown `nodeId` answers `"none"`.
 */
export type SaunaNodeCacheability = "full" | "guest-branch" | "none";

export function saunaNodeCacheability(schema: SaunaSchema, nodeId: SaunaNodeId): SaunaNodeCacheability {
  if (!schema.nodes[nodeId]) return "none";
  if (saunaPrivateNodeIds(schema).has(nodeId)) return "none";
  // Nearest declared mode on the parents chain (self first).
  const seen = new Set<SaunaNodeId>();
  let cur: SaunaNodeId | null | undefined = nodeId;
  while (cur != null && !seen.has(cur)) {
    seen.add(cur);
    const v: unknown = schema.nodes[cur]?.visibility;
    if (v === "hybrid") return "guest-branch";
    if (v === "public") return "full";
    cur = schema.parents?.[cur];
  }
  return "full";
}
