// Canonical schema operations for Sunday-Sauna.
//
// Pure, server-safe functions over `SaunaSchema`. No React, no DOM,
// no I/O — every op takes a schema in and returns a new one. Used by
// the upcoming Studio (Phase 1A) and any external consumer that wants
// to manipulate a schema without rendering it.
//
// Phase 0 sources `src/react/editor/schema-ops.ts` from this file via
// a re-export so the legacy editor and the new core stay in sync.

import { createSaunaNodeId } from "../schema/id";
import { SAUNA_DEFAULT_PROPS_VERSION } from "../schema/props-version";
import { SAUNA_REF_BLOCK_ID_PROP, SAUNA_REF_TYPE } from "./refs";
import type {
  SaunaNodeConfig,
  SaunaNodeId,
  SaunaParamSpec,
  SaunaSchema,
  VariantSpec,
  VisibilityRule,
} from "../schema/types";

/**
 * Default initialiser for a new node.
 *
 * IMPORTANT: do not hardcode component-specific defaults here. Component
 * defaults must come from the catalog (`meta.initialProps`).
 *
 * `propsVersion` is the version of the Element's props contract the new
 * node's props are written against (SDL-667) — the definition's
 * `blockPropsVersion`. It is written ONLY when it is not 1: "absent means 1"
 * is the compatibility rule (props-version.ts), so a node of a v1 Element
 * looks exactly like every node stored before the field existed.
 */
export function createInitialNodeConfig(type: string, propsVersion?: number): SaunaNodeConfig {
  return propsVersion !== undefined && propsVersion !== SAUNA_DEFAULT_PROPS_VERSION ? { type, propsVersion } : { type };
}

/** What an insertion op puts in: the Element's type, its props, and the version they follow (SDL-667). */
export type SaunaNewNode = { type: string; props?: Record<string, unknown>; propsVersion?: number };

export function getChildren(schema: SaunaSchema, parentId: SaunaNodeId): SaunaNodeId[] {
  return schema.nodes[parentId]?.children ?? [];
}

export function reorderChildren(
  schema: SaunaSchema,
  parentId: SaunaNodeId,
  fromIndex: number,
  toIndex: number
): SaunaSchema {
  const parent = schema.nodes[parentId];
  if (!parent) return schema;
  const children = [...(parent.children ?? [])];
  if (fromIndex < 0 || fromIndex >= children.length) return schema;
  if (toIndex < 0 || toIndex >= children.length) return schema;
  const [moved] = children.splice(fromIndex, 1);
  children.splice(toIndex, 0, moved);

  return {
    ...schema,
    nodes: {
      ...schema.nodes,
      [parentId]: { ...parent, children },
    },
  };
}

/**
 * Adds a child of `child.type` under `parentId`.
 *
 * `index` is the position among the parent's children (SDL-368: the PO
 * editor inserts sections INTO a boundary, not at the end). Omitted or
 * out of range it clamps to the append the op always performed — an index
 * is a preference about order, never a reason to drop the insertion.
 *
 * `options.canParent`, when supplied, is consulted before anything is
 * written, and a `false` makes the call a no-op — the same guard
 * `reparentNode` keeps (SDL-634). The rule is checked when the node goes IN:
 * the renderer draws whatever tree it is given, so a `CardHeader` placed
 * outside a `Card` would only surface later, as a broken page.
 */
export function addChildNode(
  schema: SaunaSchema,
  parentId: SaunaNodeId,
  child: SaunaNewNode,
  index?: number,
  options?: { canParent?: CanParentFn }
): { schema: SaunaSchema; nodeId: SaunaNodeId } {
  const parent = schema.nodes[parentId];
  if (!parent) return { schema, nodeId: parentId };
  if (options?.canParent && !options.canParent({ parentType: parent.type, childType: child.type })) {
    return { schema, nodeId: parentId };
  }

  const nodeId = createSaunaNodeId();
  const nextNode: SaunaNodeConfig = {
    ...createInitialNodeConfig(child.type, child.propsVersion),
    props: child.props,
  };

  const siblings = parent.children ?? [];
  const at =
    index === undefined
      ? siblings.length
      : Math.max(0, Math.min(Math.trunc(index), siblings.length));
  const nextChildren = [...siblings.slice(0, at), nodeId, ...siblings.slice(at)];

  const nextSchema: SaunaSchema = {
    ...schema,
    nodes: {
      ...schema.nodes,
      [nodeId]: nextNode,
      [parentId]: { ...parent, children: nextChildren },
    },
    parents: {
      ...schema.parents,
      [nodeId]: parentId,
    },
  };

  return { schema: nextSchema, nodeId };
}

export function updateNodeConfig(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  next: SaunaNodeConfig
): SaunaSchema {
  if (!schema.nodes[nodeId]) return schema;
  return {
    ...schema,
    nodes: {
      ...schema.nodes,
      [nodeId]: next,
    },
  };
}

function collectSubtreeIds(schema: SaunaSchema, rootId: SaunaNodeId): SaunaNodeId[] {
  const out: SaunaNodeId[] = [];
  const stack: SaunaNodeId[] = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (!schema.nodes[id]) continue;
    out.push(id);
    const children = schema.nodes[id]?.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  return out;
}

export function removeSubtree(
  schema: SaunaSchema,
  nodeId: SaunaNodeId
): { schema: SaunaSchema; parentId: SaunaNodeId | null } {
  if (!schema.nodes[nodeId]) return { schema, parentId: null };
  if (nodeId === schema.rootId) return { schema, parentId: null };

  const parentId = schema.parents[nodeId];
  if (!parentId) return { schema, parentId: null };
  const parent = schema.nodes[parentId];
  if (!parent) return { schema, parentId: null };

  const toRemove = new Set(collectSubtreeIds(schema, nodeId));

  const nextNodes: SaunaSchema["nodes"] = {};
  for (const [id, node] of Object.entries(schema.nodes)) {
    if (toRemove.has(id)) continue;
    nextNodes[id] = node;
  }

  const nextParents: SaunaSchema["parents"] = {};
  for (const [id, p] of Object.entries(schema.parents)) {
    if (toRemove.has(id)) continue;
    nextParents[id] = p;
  }

  const nextParentChildren = (parent.children ?? []).filter((c) => c !== nodeId);
  nextNodes[parentId] = {
    ...parent,
    children: nextParentChildren.length ? nextParentChildren : undefined,
  };

  return {
    schema: {
      ...schema,
      nodes: nextNodes,
      parents: nextParents,
    },
    parentId,
  };
}

/**
 * Copies the subtree at `nodeId` next to it. Every node is copied whole,
 * `propsVersion` included (SDL-667): a copy is the same props at the same
 * contract, so it keeps the SOURCE's version — stamping the definition's
 * current one would claim a contract the copied props were never written
 * against.
 */
export function duplicateSubtree(
  schema: SaunaSchema,
  nodeId: SaunaNodeId
): { schema: SaunaSchema; nodeId: SaunaNodeId } {
  const src = schema.nodes[nodeId];
  if (!src) return { schema, nodeId };
  if (nodeId === schema.rootId) return { schema, nodeId };

  const parentId = schema.parents[nodeId];
  if (!parentId) return { schema, nodeId };
  const parent = schema.nodes[parentId];
  if (!parent) return { schema, nodeId };

  const ids = collectSubtreeIds(schema, nodeId);
  const map = new Map<SaunaNodeId, SaunaNodeId>();
  for (const oldId of ids) map.set(oldId, createSaunaNodeId());

  const nextNodes: SaunaSchema["nodes"] = { ...schema.nodes };
  const nextParents: SaunaSchema["parents"] = { ...schema.parents };

  for (const oldId of ids) {
    const newId = map.get(oldId)!;
    const oldNode = schema.nodes[oldId]!;
    const nextChildren = (oldNode.children ?? [])
      .map((c) => map.get(c)!)
      .filter(Boolean);

    nextNodes[newId] = {
      ...oldNode,
      children: nextChildren.length ? nextChildren : undefined,
    };

    const oldParent = schema.parents[oldId];
    nextParents[newId] = oldParent ? map.get(oldParent) ?? oldParent : oldParent;
  }

  const newRootId = map.get(nodeId)!;
  nextParents[newRootId] = parentId;

  const siblings = [...(parent.children ?? [])];
  const idx = siblings.indexOf(nodeId);
  const insertAt = idx >= 0 ? idx + 1 : siblings.length;
  siblings.splice(insertAt, 0, newRootId);
  nextNodes[parentId] = { ...parent, children: siblings };

  return {
    schema: {
      ...schema,
      nodes: nextNodes,
      parents: nextParents,
    },
    nodeId: newRootId,
  };
}

// ---------------------------------------------------------------------------
// New ops introduced by Phase 1A (Studio)
// ---------------------------------------------------------------------------

/**
 * Predicate the caller supplies to keep composition rules (the catalog's
 * `allowedParents` / `allowedChildren`) enforced at the operation, not only
 * in the UI that happens to call it. Consulted by every op that puts a node
 * under a parent: `addChildNode`, `replaceSubtreeWithNode`, `reparentNode`.
 */
export type CanParentFn = (args: {
  parentType: string;
  childType: string;
}) => boolean;

/**
 * Re-parent a node to a new parent at an explicit index (or append when
 * `index` is omitted). Cycles are rejected — moving a subtree under one
 * of its own descendants is a no-op.
 *
 * `options.canParent`, when supplied, is consulted before the move and a
 * `false` makes the whole call a no-op. It lives here for the same reason
 * the cycle guard does: until SDL-304 the composition rule was enforced by
 * exactly one screen (the insert modal), so anything else reaching the op —
 * a drag, a hotkey, a future paste — could place a `CardHeader` outside a
 * `Card`. A guard that only one call site runs is not an invariant.
 */
export function reparentNode(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  newParentId: SaunaNodeId,
  index?: number,
  options?: { canParent?: CanParentFn }
): SaunaSchema {
  if (nodeId === schema.rootId) return schema;
  if (!schema.nodes[nodeId]) return schema;
  if (!schema.nodes[newParentId]) return schema;
  if (nodeId === newParentId) return schema;

  if (
    options?.canParent &&
    !options.canParent({
      parentType: schema.nodes[newParentId]!.type,
      childType: schema.nodes[nodeId]!.type,
    })
  ) {
    return schema;
  }

  const oldParentId = schema.parents[nodeId];
  if (!oldParentId) return schema;

  // Cycle guard: refuse to drop a node into its own subtree.
  const subtree = new Set(collectSubtreeIds(schema, nodeId));
  if (subtree.has(newParentId)) return schema;

  const oldParent = schema.nodes[oldParentId]!;
  const oldChildren = (oldParent.children ?? []).filter((c) => c !== nodeId);

  const sameParent = oldParentId === newParentId;
  const newParentSrc = sameParent ? { ...oldParent, children: oldChildren } : schema.nodes[newParentId]!;
  const newParentChildren = sameParent ? [...oldChildren] : [...(newParentSrc.children ?? [])];

  const insertAt =
    typeof index === "number"
      ? Math.max(0, Math.min(index, newParentChildren.length))
      : newParentChildren.length;
  newParentChildren.splice(insertAt, 0, nodeId);

  const nextNodes: SaunaSchema["nodes"] = { ...schema.nodes };
  if (sameParent) {
    nextNodes[oldParentId] = {
      ...oldParent,
      children: newParentChildren.length ? newParentChildren : undefined,
    };
  } else {
    nextNodes[oldParentId] = {
      ...oldParent,
      children: oldChildren.length ? oldChildren : undefined,
    };
    nextNodes[newParentId] = {
      ...newParentSrc,
      children: newParentChildren,
    };
  }

  return {
    ...schema,
    nodes: nextNodes,
    parents: {
      ...schema.parents,
      [nodeId]: newParentId,
    },
  };
}

/**
 * Shallow-merge a partial props patch into a node's props. `undefined`
 * values in the patch are treated as "delete this key" so callers can
 * unset a prop without resending the whole object.
 */
export function updateNodePropsPartial(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  patch: Record<string, unknown>
): SaunaSchema {
  const node = schema.nodes[nodeId];
  if (!node) return schema;

  const merged: Record<string, unknown> = { ...(node.props ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) {
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }

  const hasAny = Object.keys(merged).length > 0;
  return {
    ...schema,
    nodes: {
      ...schema.nodes,
      [nodeId]: {
        ...node,
        props: hasAny ? merged : undefined,
      },
    },
  };
}

/**
 * Set or clear a node's visibility rule. Pass `null` to clear (the node
 * becomes unconditionally visible).
 */
export function setVisibility(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  rule: VisibilityRule | null
): SaunaSchema {
  const node = schema.nodes[nodeId];
  if (!node) return schema;

  return {
    ...schema,
    nodes: {
      ...schema.nodes,
      [nodeId]: {
        ...node,
        visibility: rule ?? undefined,
      },
    },
  };
}

/**
 * Replace a node's `variants` array wholesale. Passing `null` or an
 * empty array drops the field entirely — the renderer's fallback path
 * treats both as "no variants" anyway, but keeping the canonical
 * form `undefined` for "no variants" avoids spurious diffs in JSON
 * dumps and Studio history snapshots.
 *
 * Used by Studio variant editor (M2-PR9c) for add/remove/reorder/
 * inline-edit on the same node — the editor maintains the working
 * list in local state and pushes the whole array each time. That
 * lets us reuse one op for every mutation, mirroring how the rest
 * of the props-pane works.
 */
export function setVariants(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  variants: VariantSpec[] | null
): SaunaSchema {
  const node = schema.nodes[nodeId];
  if (!node) return schema;

  const next: SaunaNodeConfig = { ...node };
  if (!variants || variants.length === 0) {
    delete next.variants;
  } else {
    next.variants = variants;
  }

  return {
    ...schema,
    nodes: {
      ...schema.nodes,
      [nodeId]: next,
    },
  };
}

/**
 * Set or clear a node's author-given name (SDL-302).
 *
 * The value is trimmed and an empty result CLEARS the field rather than
 * storing `""`: a name is what the outline shows instead of the type, and
 * an empty string would show as an empty row. Clearing through the same op
 * that sets is why the editor needs no separate "reset name" path — the
 * author selects the text and presses Enter.
 *
 * Renaming the root is allowed: the root is a node like any other, and
 * "Home" reads better than "Page" in a tree of many pages. Renaming does
 * not touch `type`, so nothing about rendering changes.
 */
export function renameNode(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  name: string | null
): SaunaSchema {
  const node = schema.nodes[nodeId];
  if (!node) return schema;

  const trimmed = name?.trim() ?? "";
  const next: SaunaNodeConfig = { ...node };
  if (trimmed.length === 0) {
    delete next.name;
  } else {
    next.name = trimmed;
  }

  // No-op when nothing moved, so the store skips the history push and an
  // Enter on an unchanged field does not cost the author an undo step.
  if (next.name === node.name) return schema;

  return {
    ...schema,
    nodes: {
      ...schema.nodes,
      [nodeId]: next,
    },
  };
}

/**
 * How a node is called in editor chrome — the outline row, the properties
 * header, the parent trail (SDL-302).
 *
 * ONE resolver for every surface on purpose. The moment two places decide
 * independently whether to show the name or the type, they drift, and the
 * tree starts calling a node something the properties panel does not — the
 * same failure the SDL-304 drop indicator avoided by sharing its one
 * computation with the operation it draws.
 *
 * A name of whitespace resolves to the type: `renameNode` cannot store one,
 * but a hand-written schema can, and chrome must never render a blank row.
 */
export function saunaNodeDisplayName(
  node: Pick<SaunaNodeConfig, "type" | "name"> | undefined
): string {
  if (!node) return "";
  const name = node.name?.trim();
  return name && name.length > 0 ? name : node.type;
}

// ---------------------------------------------------------------------------
// Block parameters — the manifest half (SDL-500, EP-61)
// ---------------------------------------------------------------------------

/**
 * Replace a document's parameter manifest wholesale. `null` or an empty
 * array drops the field, so a block whose last parameter was removed is
 * byte-identical to one that never had any — same canonical-`undefined`
 * reasoning as {@link setVariants}, and the reason no migration was
 * needed when `params` was added.
 *
 * One op for add/remove/rename/reorder rather than four: the editor that
 * will drive this (SDL-503) keeps the working list in local state and
 * pushes the whole array, which the snapshot history then undoes as a
 * single step.
 *
 * DELIBERATELY UNDEFENDED against orphans and duplicates. It refuses
 * nothing, checks no `nodeId`, and does not look at what it replaces:
 * this is the storage write path, and a manifest that names a node the
 * author is about to create is a legal intermediate state. The rule that
 * a name must be unique and a path must resolve is enforced where it can
 * report — the validator on read ({@link validateSaunaSchema}, structural
 * only) and SDL-501's orphan check, which hard rule 7 requires to land
 * before any resolver substitutes a param.
 */
export function setBlockParams(
  schema: SaunaSchema,
  params: SaunaParamSpec[] | null
): SaunaSchema {
  const next: SaunaSchema = { ...schema };
  if (!params || params.length === 0) {
    delete next.params;
  } else {
    next.params = params;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Saving a subtree as a project block (SDL-341)
// ---------------------------------------------------------------------------

/**
 * The subtree under `nodeId` as a STANDALONE schema — what gets written
 * to `/blocks/<id>` when the author saves a node as a component.
 *
 * Node ids are carried over unchanged. They only have to be unique
 * inside one document, and the block IS a separate document, so
 * re-minting them would buy nothing and would break nothing either —
 * carrying them keeps the two sides diffable while the page still holds
 * the same ids in its history stack.
 *
 * The root of the block drops `visibility`: the page keeps that rule on
 * the `Ref` it leaves behind ({@link replaceSubtreeWithRef}), and a copy
 * on both sides would evaluate twice — once per document — which is not
 * what the author wrote when they hid one node on one page. Everything
 * else about the node is content and travels with it: `props`,
 * `children`, `variants`, `name`.
 *
 * `null` when the node does not exist.
 */
export function extractBlockSchema(
  schema: SaunaSchema,
  nodeId: SaunaNodeId
): SaunaSchema | null {
  const root = schema.nodes[nodeId];
  if (!root) return null;

  const ids = collectSubtreeIds(schema, nodeId);
  const nodes: SaunaSchema["nodes"] = {};
  const parents: SaunaSchema["parents"] = {};

  for (const id of ids) {
    nodes[id] = schema.nodes[id]!;
    parents[id] = id === nodeId ? null : (schema.parents[id] ?? null);
  }

  const { visibility: _pageRule, ...content } = root;
  nodes[nodeId] = content;

  return { version: 2, rootId: nodeId, nodes, parents };
}

/**
 * Replaces the subtree under `nodeId` with a reference to `blockId`,
 * in place — the page half of "save as component".
 *
 * The node KEEPS ITS ID. The outline row, the selection, the collapse
 * memory and the hover mark all address nodes by id, and an author who
 * saves the node they are looking at should still be looking at it
 * afterwards. `name` and `visibility` stay for the same reason: they
 * describe the node's place on THIS page, not the content that just
 * moved out. `props`, `children` and `variants` go with the content.
 *
 * The root is refused: a document whose root is a reference has no
 * content of its own left to edit, and the menu draws the action
 * disabled on the root row for the same reason it disables «Удалить».
 * Returns the schema unchanged when it cannot act, like every op here.
 */
export function replaceSubtreeWithRef(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  blockId: string
): SaunaSchema {
  const node = schema.nodes[nodeId];
  if (!node) return schema;
  if (nodeId === schema.rootId) return schema;
  const id = blockId.trim();
  if (!id) return schema;

  // Descendants leave the document; the node itself stays put.
  const dropped = new Set(collectSubtreeIds(schema, nodeId));
  dropped.delete(nodeId);

  const nodes: SaunaSchema["nodes"] = {};
  for (const [key, value] of Object.entries(schema.nodes)) {
    if (dropped.has(key)) continue;
    nodes[key] = value;
  }
  const parents: SaunaSchema["parents"] = {};
  for (const [key, value] of Object.entries(schema.parents)) {
    if (dropped.has(key)) continue;
    parents[key] = value;
  }

  const ref: SaunaNodeConfig = {
    type: SAUNA_REF_TYPE,
    props: { [SAUNA_REF_BLOCK_ID_PROP]: id },
  };
  if (node.name !== undefined) ref.name = node.name;
  if (node.visibility !== undefined) ref.visibility = node.visibility;
  nodes[nodeId] = ref;

  return { ...schema, nodes, parents };
}

/**
 * Replaces the subtree under `nodeId` with a FRESH node of `child.type`,
 * at the same position under the same parent (SDL-368: «Заменить секцию»).
 *
 * Unlike {@link replaceSubtreeWithRef} the id does NOT survive: the old
 * node's identity — its name, visibility, variants — describes the section
 * being thrown away, and a replacement that kept them would dress the new
 * section in the old one's clothes. One pure function rather than a
 * remove + add pair at the call site so the swap is a single `SchemaOp`,
 * which the snapshot history undoes as ONE step by construction.
 *
 * Refuses the root and detached nodes, returns the schema unchanged when
 * it cannot act, like every op here.
 */
export function replaceSubtreeWithNode(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  child: SaunaNewNode,
  options?: { canParent?: CanParentFn }
): { schema: SaunaSchema; nodeId: SaunaNodeId } {
  if (!schema.nodes[nodeId]) return { schema, nodeId };
  if (nodeId === schema.rootId) return { schema, nodeId };
  const parentId = schema.parents[nodeId];
  if (!parentId || !schema.nodes[parentId]) return { schema, nodeId };
  const index = (schema.nodes[parentId].children ?? []).indexOf(nodeId);
  if (index < 0) return { schema, nodeId };
  // Checked before the removal: a refused replacement must leave the old
  // section standing, not a hole where it was (SDL-634).
  if (
    options?.canParent &&
    !options.canParent({ parentType: schema.nodes[parentId].type, childType: child.type })
  ) {
    return { schema, nodeId };
  }

  const { schema: removed } = removeSubtree(schema, nodeId);
  if (removed === schema) return { schema, nodeId };
  return addChildNode(removed, parentId, child, index);
}

/**
 * Replaces a `Ref` node with a COPY of the referenced block's content,
 * in place — the page half of detach ("expand into a copy", SDL-434).
 *
 * The exact inverse of {@link replaceSubtreeWithRef}, and deliberately
 * symmetric with it. The node KEEPS ITS ID, its `name` and its
 * `visibility`: those describe the node's place on THIS page, not the
 * content that is arriving. `type`, `props`, `children` and `variants`
 * come from the block's root, and every DESCENDANT gets a fresh id —
 * the block's own ids belong to the block document and would collide
 * the moment the same block is expanded twice on one page.
 *
 * Refuses, returning the schema unchanged like every op here:
 * - a node that is not a ref, or points at a different block;
 * - a ref whose VARIANTS carry block ids. Such a node renders a
 *   different block per context, and there is no single copy that
 *   preserves that; the caller (`planBlockDetach`) refuses the whole
 *   operation on those rather than mangling one branch of it.
 */
export function expandRefIntoCopy(
  schema: SaunaSchema,
  nodeId: SaunaNodeId,
  blockId: string,
  blockSchema: SaunaSchema
): SaunaSchema {
  const node = schema.nodes[nodeId];
  if (!node || node.type !== SAUNA_REF_TYPE) return schema;
  if (refNodeOwnBlockId(node) !== blockId.trim()) return schema;
  if (refNodeHasVariantBlockIds(node)) return schema;

  const blockRoot = blockSchema.nodes[blockSchema.rootId];
  if (!blockRoot) return schema;

  // Fresh ids for everything BUT the root, which reuses the ref's id.
  const ids = collectSubtreeIds(blockSchema, blockSchema.rootId);
  const map = new Map<SaunaNodeId, SaunaNodeId>();
  for (const oldId of ids) {
    map.set(oldId, oldId === blockSchema.rootId ? nodeId : createSaunaNodeId());
  }

  const nodes: SaunaSchema["nodes"] = { ...schema.nodes };
  const parents: SaunaSchema["parents"] = { ...schema.parents };

  for (const oldId of ids) {
    const newId = map.get(oldId)!;
    const source = blockSchema.nodes[oldId]!;
    const children = (source.children ?? []).map((c) => map.get(c)!).filter(Boolean);
    const copied: SaunaNodeConfig = {
      ...source,
      children: children.length ? children : undefined,
    };
    if (oldId === blockSchema.rootId) {
      // The ref's own name/visibility win: they are the page's words
      // about this slot. The block root's are the block's words about
      // itself and do not travel — same asymmetry as save-as-component.
      delete copied.name;
      delete copied.visibility;
      if (node.name !== undefined) copied.name = node.name;
      if (node.visibility !== undefined) copied.visibility = node.visibility;
      parents[newId] = schema.parents[nodeId] ?? null;
    } else {
      const oldParent = blockSchema.parents[oldId];
      parents[newId] = oldParent ? (map.get(oldParent) ?? null) : null;
    }
    nodes[newId] = copied;
  }

  return { ...schema, nodes, parents };
}

/** The block id a ref node carries in its OWN props, trimmed. */
function refNodeOwnBlockId(node: SaunaNodeConfig): string | null {
  const raw = node.props?.[SAUNA_REF_BLOCK_ID_PROP];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Does any variant of this node point at a block of its own? */
function refNodeHasVariantBlockIds(node: SaunaNodeConfig): boolean {
  return (node.variants ?? []).some((variant) => {
    const raw = variant.props?.[SAUNA_REF_BLOCK_ID_PROP];
    return typeof raw === "string" && raw.trim().length > 0;
  });
}

/**
 * Which nodes of one document reference `blockId`, split by whether
 * detach can act on them (SDL-434).
 *
 * `expandable` are ordinary refs — {@link expandRefIntoCopy} replaces
 * each with a copy. `unsupported` are refs whose variants carry block
 * ids: one node that renders a different block per context, which no
 * single copy preserves. The split exists so the caller can refuse
 * BEFORE writing anything, rather than discovering the case halfway
 * through a multi-document rewrite.
 */
export function refNodesForBlock(
  schema: SaunaSchema,
  blockId: string
): { expandable: SaunaNodeId[]; unsupported: SaunaNodeId[] } {
  const id = blockId.trim();
  const expandable: SaunaNodeId[] = [];
  const unsupported: SaunaNodeId[] = [];
  for (const [nodeId, node] of Object.entries(schema.nodes)) {
    if (node.type !== SAUNA_REF_TYPE) continue;
    const own = refNodeOwnBlockId(node) === id;
    const inVariants = (node.variants ?? []).some((variant) => {
      const raw = variant.props?.[SAUNA_REF_BLOCK_ID_PROP];
      return typeof raw === "string" && raw.trim() === id;
    });
    if (!own && !inVariants) continue;
    if (refNodeHasVariantBlockIds(node)) unsupported.push(nodeId);
    else if (own) expandable.push(nodeId);
  }
  return { expandable: expandable.sort(), unsupported: unsupported.sort() };
}
