import * as React from "react";

import type { SaunaNodeConfig, SaunaNodeId, SaunaSchema, SaunaVisibilityMode } from "../schema/types";
// Co-located in `src/react/` so renderer's dist file resolves
// `./visibility` cleanly under bundle:false. The previous attempt
// imported through the root index — that broke under turbopack in
// prod because cross-folder relative imports don't get rewritten the
// same way as same-folder ones (see
// memory/feedback_tsup_entries_required.md, dated 2026-05-13).
import { evaluateVisibility, saunaAudience } from "./visibility";
import { resolveNodeBody } from "./variants";
import type { SaunaContext, SaunaRegistry } from "./types";
import {
  SAUNA_REF_BLOCK_ID_PROP,
  SAUNA_REF_PARAMS_PROP,
  SAUNA_REF_TYPE,
  type SaunaBlockMap,
} from "../core/refs";
import { applyBlockParams } from "../core/apply-params";
import { parseFileRef } from "../core/file-refs";
import { stripUnsafeProps } from "../core/safe-url";
import { saunaNodeVisibilityMode } from "../core/visibility-mode";
import { elementPropsVersionMismatch } from "../core/element-props";
import type { BlockDefinition } from "../core/define-block";

// NOTE: SaunaNodeErrorBoundary is NOT imported here. It is a React
// class component, which means RSC server bundles (no React.Component
// export) can't load it. Callers that want per-node fault isolation in
// the browser should wrap the renderer themselves with
// `import { SaunaNodeErrorBoundary } from "@/engine/react"` (client
// only). The server renderer will surface render errors as plain
// rejections which Next.js renders via its own error.tsx boundary.

/**
 * DOM attribute carrying the schema id of the node that produced an element.
 * Written only in `editable` mode; the canvas reads it back with
 * `closest("[data-sauna-node-id]")` to turn a click into a selection.
 */
export const SAUNA_NODE_ID_ATTR = "data-sauna-node-id";

/**
 * DOM attribute on the placeholder a `Ref` renders when it cannot draw
 * the block it points at. Its value is the reason (`missing` | `cycle`
 * | `no-block-id`), which is what the e2e specs assert on — the visible
 * text is copy and may be reworded.
 */
export const SAUNA_REF_PLACEHOLDER_ATTR = "data-sauna-ref-placeholder";

/** DOM attribute carrying the block id of a rendered `Ref` node. */
export const SAUNA_REF_BLOCK_ATTR = "data-sauna-ref-block";

/**
 * DOM attribute on the placeholder a node renders when its `type` is not in
 * the registry (SDL-608). Its value is the missing type name, which is what
 * the guards assert on — the visible text is copy and may be reworded.
 *
 * This is a DELIBERATE divergence from the frozen reference engine, which
 * returned `null` here. Rendering nothing loses the node AND everything
 * under it, with no trace anywhere: a page published by someone else goes
 * silently blank the day an export is renamed away. The reference already
 * refused to stay silent for a `Ref` whose target is gone (see
 * `SAUNA_REF_PLACEHOLDER_ATTR`); an unknown type is the same failure with a
 * wider blast radius, so it gets the same treatment.
 */
export const SAUNA_UNKNOWN_TYPE_ATTR = "data-sauna-unknown-type";

/**
 * DOM attribute on that same placeholder, present only when the unknown node
 * had children: how many direct children were not drawn. Absent means the
 * node was a leaf — the distinction between "a caption vanished" and "a
 * wrapper took half the page with it".
 */
export const SAUNA_UNKNOWN_CHILDREN_ATTR = "data-sauna-unknown-children";

/**
 * DOM attribute on the placeholder a node renders when its `propsVersion`
 * is not the one its Element definition is at (SDL-667) — props written
 * against a contract this build cannot read. Value: `<type>@v<node's
 * version>`. Same shape as the unknown-type placeholder, and the same
 * `SAUNA_UNKNOWN_CHILDREN_ATTR` counts the direct children not drawn.
 */
export const SAUNA_UNKNOWN_PROPS_VERSION_ATTR = "data-sauna-unknown-props-version";

/** What the renderer needs of an Element definition: its type and props version. */
export type SaunaRenderElement = Pick<BlockDefinition, "type" | "propsVersion">;

export type SaunaRendererProps = {
  schema: SaunaSchema;
  registry: SaunaRegistry;
  context?: SaunaContext;
  /**
   * Project-block schemas a `Ref` node in this document can resolve to
   * (SDL-338), keyed by block id. The renderer is synchronous, so the
   * caller loads them first — `loadBlockRefs()` walks nested refs and
   * returns exactly this shape.
   *
   * A referenced id that is absent here renders a visible placeholder,
   * never nothing: an author who deleted a block has to see where the
   * hole is, and a page that silently loses a section is the failure
   * mode this exists to prevent.
   */
  blocks?: SaunaBlockMap;
  /**
   * Editor mode (SDL-298). Tags every rendered node with
   * `data-sauna-node-id` so the canvas can hit-test a click back to a node
   * in the schema. Off by default and never set by the public render route:
   * a visitor's page must not carry the editor's identifiers.
   *
   * The attribute reaches the DOM through the component's own props, so a
   * registry component only becomes selectable if its ROOT ELEMENT spreads
   * the props it does not consume. That is the contract for custom
   * registries (docs/domains/render.md); `primitives-forward-props` holds
   * our own set to it.
   */
  editable?: boolean;
  /**
   * Per-node fault isolation (SDL-633), for the editor canvas: each node of
   * THIS document for which `isolate(type)` holds (all, when absent) is
   * wrapped in `nodeBoundary`, so one node that throws draws a plate instead
   * of taking the canvas down. Pass `SaunaNodeErrorBoundary` from
   * `@markerloop/engine/react` — a class component, which is why the renderer
   * does not import it (RSC server bundles cannot load one).
   *
   * Nodes inside a `Ref`'s block are not wrapped: they are not editable from
   * the page, the ref as a whole is.
   */
  nodeBoundary?: React.ComponentType<SaunaNodeBoundaryProps>;
  isolate?: (type: string) => boolean;
  /**
   * The Element definitions of the registry (SDL-667, EP-128) — the same
   * `blocks` the catalog pairs with it. With them, a node whose
   * `propsVersion` (absent = 1) is not its definition's is drawn as a plate
   * (`SAUNA_UNKNOWN_PROPS_VERSION_ATTR`) instead of handing the component
   * props it was not written for. A type with no definition here is drawn as
   * before; without `elements` nothing is checked (the reference's
   * behaviour, which the parity snapshot pins).
   */
  elements?: readonly SaunaRenderElement[];
};

/** The props `nodeBoundary` receives; the same shape as `SaunaNodeErrorBoundary`'s. */
export type SaunaNodeBoundaryProps = {
  nodeType: string;
  nodeId: string;
  /** The node's stored config — a new object after every edit of the node. */
  resetKey: unknown;
  editable?: boolean;
  children: React.ReactNode;
};

export function SaunaRenderer({
  schema,
  registry,
  context,
  editable,
  blocks,
  nodeBoundary,
  isolate,
  elements,
}: SaunaRendererProps) {
  /**
   * @param doc      schema being walked — the page, or a block's own
   *                 schema once we are inside a `Ref`.
   * @param stack    block ids currently being expanded, innermost last.
   *                 Guards against a cycle that reached storage anyway.
   * @param sealedAs editor identity of the element about to be rendered:
   *                 `undefined` — page-level node, marks itself;
   *                 a node id  — root of a ref's block, marks itself as
   *                 the REF node so a click selects the ref, not a node
   *                 that does not exist in this document;
   *                 `null`     — inside a ref, below its root: unmarked,
   *                 because block internals are not editable from the
   *                 page (that is what makes it a reference).
   * @param inherited visibility mode in force above this node (SDL-632):
   *                 the nearest ancestor's declared mode, `undefined` when
   *                 none declared one. A `Ref` hands its own down into the
   *                 block, so a block placed in a hybrid section is hybrid.
   */
  const isMember = saunaAudience(context) === "member";
  const definitions = elementsByType(elements);

  const renderNode = (
    doc: SaunaSchema,
    id: SaunaNodeId,
    key: React.Key | undefined,
    stack: readonly string[],
    sealedAs: SaunaNodeId | null | undefined,
    inherited: SaunaVisibilityMode | undefined,
  ): React.ReactNode => {
    const node = doc.nodes[id];
    if (!node) return null;

    if (!canRender(node, context)) return null;

    // The mode in force here: the node's own, else the nearest ancestor's.
    // `member.props` means something only where it is hybrid.
    const mode = saunaNodeVisibilityMode(node) ?? inherited;

    // Variants are resolved AFTER the visibility gate — visibility
    // decides "render at all?", variants pick the body. The
    // resolved body is identity-stable when no variant matched, so
    // we don't allocate on the fallback path.
    const body = resolveNodeBody(node, context, { memberBranch: isMember && mode === "hybrid" });

    const markId = sealedAs === undefined ? id : sealedAs;

    // Refs are intercepted before the registry lookup: `Ref` is not a
    // component, it is an instruction to render a different document.
    if (node.type === SAUNA_REF_TYPE) {
      return renderRef(body.props, key, stack, markId, mode);
    }

    // The props contract is checked before the component is looked up
    // (SDL-667): props written against another version of the Element are
    // not handed to a component that would misread them. Same rule as
    // `parseElementProps` — `elementPropsVersionMismatch` is its first step.
    const def = definitions?.get(node.type);
    const mismatch = def ? elementPropsVersionMismatch(def, node) : null;
    if (mismatch) {
      return unknownPropsVersionPlaceholder(node.type, mismatch, (body.children ?? []).length, key, markId, editable);
    }

    const Comp = registry[node.type];
    // An unknown type draws a placeholder, never nothing — the node's whole
    // subtree would disappear with it, and a hole the author can see is the
    // only thing that distinguishes "the component is gone" from "the author
    // deleted this". Same reasoning as `renderRef` below, see
    // SAUNA_UNKNOWN_TYPE_ATTR.
    //
    // The subtree is still not drawn: there is no sane place to put the
    // children of a component nobody can render (a missing `Card` would spill
    // its contents into whatever surrounds it). So the placeholder SAYS how
    // many direct children went with it instead of pretending the node was a
    // leaf — a wrapper that ate half the page has to look different from a
    // missing caption.
    if (!Comp) return unknownTypePlaceholder(node.type, (body.children ?? []).length, key, markId, editable);

    const childSeal = sealedAs === undefined ? undefined : null;
    const children = (body.children ?? []).map((childId, idx) =>
      renderNode(doc, childId, idx, stack, childSeal, mode),
    );
    const props = resolveProps(body.props, context);

    // Build final props instead of passing `children` as the third
    // createElement argument. Under React 19 a third arg of
    // `undefined` overrides `props.children` to undefined — which
    // wipes out leaf nodes that carry their text via the `children`
    // prop (e.g. `{ "type": "Text", "props": { "children": "Hi" } }`).
    // Schema children, when present, still take precedence over any
    // `children` in props — that's the explicit "the tree says so"
    // intent.
    const elementProps: Record<string, unknown> =
      children.length > 0 ? { ...props, children, key } : { ...props, key };

    // The marker goes on LAST so a node cannot overwrite its own identity
    // from `props` — the attribute is the editor's, not the author's.
    if (editable && markId !== null) elementProps[SAUNA_NODE_ID_ATTR] = markId;

    if (nodeBoundary && sealedAs === undefined && (isolate?.(node.type) ?? true)) {
      const { key: _key, ...inner } = elementProps;
      const boundaryProps: SaunaNodeBoundaryProps & { key: React.Key | undefined } = {
        key,
        nodeId: id,
        nodeType: node.type,
        resetKey: node,
        editable,
        children: React.createElement(Comp, inner),
      };
      return React.createElement(nodeBoundary, boundaryProps);
    }
    return React.createElement(Comp, elementProps);
  };

  /**
   * Expands one `Ref` node into the block it points at.
   *
   * Every failure draws a placeholder rather than returning `null`: a
   * reference whose target is gone is the one case where rendering
   * nothing is indistinguishable from "the author deleted the section".
   */
  const renderRef = (
    props: Record<string, unknown> | undefined,
    key: React.Key | undefined,
    stack: readonly string[],
    markId: SaunaNodeId | null,
    inherited: SaunaVisibilityMode | undefined,
  ): React.ReactNode => {
    const raw = props?.[SAUNA_REF_BLOCK_ID_PROP];
    const blockId = typeof raw === "string" ? raw.trim() : "";

    if (!blockId) return refPlaceholder("no-block-id", blockId, key, markId, editable);

    // A cycle is supposed to be impossible — it is refused at insert.
    // This guard is for the schema that got there another way (a hand-
    // written JSON, a block deleted and recreated under an id something
    // else already points at). Without it the recursion never returns.
    if (stack.includes(blockId)) return refPlaceholder("cycle", blockId, key, markId, editable);

    const blockSchema = blocks?.[blockId];
    if (!blockSchema) return refPlaceholder("missing", blockId, key, markId, editable);

    // Parameters (SDL-502): the page's values are written into the
    // block's props before it is walked, so substitution happens on THIS
    // page only and the stored block is untouched. `props` here is the
    // ref's RESOLVED body, so a variant that supplies its own values
    // wins, exactly as it does for `blockId` two lines up.
    const parameterised = applyBlockParams(blockSchema, refParamsFrom(props));

    // The block's root takes over the ref's editor identity, so a click
    // anywhere inside selects the ref node on the PAGE. Nothing below it
    // is marked — see `sealedAs` above.
    return renderNode(parameterised, parameterised.rootId, key, [...stack, blockId], markId, inherited);
  };

  return <>{renderNode(schema, schema.rootId, undefined, [], undefined, undefined)}</>;
}

/**
 * The parameter values a ref's resolved props carry, or `null`.
 *
 * Same shape check as `refParamValues()`, which takes a NODE — here the
 * variant has already been resolved into a props bag and the node is no
 * longer in hand. Anything that is not a plain object (a string, an
 * array, `null`) reads as "no values" rather than as an error: stored
 * data is not ours to trust, and a page whose params prop was hand-
 * edited into nonsense should render the block, not a blank.
 */
function refParamsFrom(
  props: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  const raw = props?.[SAUNA_REF_PARAMS_PROP];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

type RefPlaceholderReason = "missing" | "cycle" | "no-block-id";

const REF_PLACEHOLDER_TEXT: Record<RefPlaceholderReason, (blockId: string) => string> = {
  missing: (blockId) => `Component «${blockId}» not found`,
  cycle: (blockId) => `Component «${blockId}» references itself`,
  "no-block-id": () => "Component reference without a blockId",
};

function refPlaceholder(
  reason: RefPlaceholderReason,
  blockId: string,
  key: React.Key | undefined,
  markId: SaunaNodeId | null,
  editable: boolean | undefined,
): React.ReactElement {
  const props: Record<string, unknown> = {
    key,
    className: "ss-ref-placeholder",
    [SAUNA_REF_PLACEHOLDER_ATTR]: reason,
  };
  if (blockId) props[SAUNA_REF_BLOCK_ATTR] = blockId;
  if (editable && markId !== null) props[SAUNA_NODE_ID_ATTR] = markId;
  return React.createElement("div", props, REF_PLACEHOLDER_TEXT[reason](blockId));
}

/**
 * The hole left by a node whose `type` no registry entry answers to.
 *
 * Shaped exactly like `refPlaceholder`: a `div` carrying the reason in a
 * data attribute and the copy as text. The type name goes in the attribute
 * so a guard can assert on it without depending on wording.
 */
function unknownTypePlaceholder(
  type: string,
  childCount: number,
  key: React.Key | undefined,
  markId: SaunaNodeId | null,
  editable: boolean | undefined,
): React.ReactElement {
  const props: Record<string, unknown> = {
    key,
    className: "ss-unknown-type-placeholder",
    [SAUNA_UNKNOWN_TYPE_ATTR]: type,
  };
  if (childCount > 0) props[SAUNA_UNKNOWN_CHILDREN_ATTR] = String(childCount);
  if (editable && markId !== null) props[SAUNA_NODE_ID_ATTR] = markId;
  const text =
    childCount > 0
      ? `Component «${type}» is not in the registry — ${childCount} nested block(s) not drawn`
      : `Component «${type}» is not in the registry`;
  return React.createElement("div", props, text);
}

/**
 * The hole left by a node whose props follow another version of its
 * Element's contract (SDL-667). Shaped like `unknownTypePlaceholder`: the
 * subtree is not drawn either — the component that would place it is the
 * one that cannot read the node — and the plate says how many direct
 * children went with it.
 */
function unknownPropsVersionPlaceholder(
  type: string,
  versions: { nodeVersion: number; knownVersion: number },
  childCount: number,
  key: React.Key | undefined,
  markId: SaunaNodeId | null,
  editable: boolean | undefined,
): React.ReactElement {
  const props: Record<string, unknown> = {
    key,
    className: "ss-unknown-props-version-placeholder",
    [SAUNA_UNKNOWN_PROPS_VERSION_ATTR]: `${type}@v${versions.nodeVersion}`,
  };
  if (childCount > 0) props[SAUNA_UNKNOWN_CHILDREN_ATTR] = String(childCount);
  if (editable && markId !== null) props[SAUNA_NODE_ID_ATTR] = markId;
  const head = `Component «${type}» stores props schema v${versions.nodeVersion}; this build knows v${versions.knownVersion}`;
  const text = childCount > 0 ? `${head} — ${childCount} nested block(s) not drawn` : head;
  return React.createElement("div", props, text);
}

/** Type → definition, built once per `elements` array (the host's catalog is a module constant). */
const ELEMENTS_BY_TYPE = new WeakMap<readonly SaunaRenderElement[], ReadonlyMap<string, SaunaRenderElement>>();
function elementsByType(
  elements: readonly SaunaRenderElement[] | undefined,
): ReadonlyMap<string, SaunaRenderElement> | null {
  if (!elements) return null;
  let map = ELEMENTS_BY_TYPE.get(elements);
  if (!map) {
    const built = new Map<string, SaunaRenderElement>();
    for (const e of elements) if (!built.has(e.type)) built.set(e.type, e);
    ELEMENTS_BY_TYPE.set(elements, built);
    map = built;
  }
  return map;
}

// canRender — visibility gate at render time. Returns true iff the
// node should produce output. A mode string (SDL-632: public / hybrid
// render, private only for a member, any other string hides) or one of
// two legacy rule kinds:
//
//   - `permission` (legacy): asks `context.can(code)`. Fail-closed —
//     a rule with `permission` set but no `can` in context hides the
//     node.
//   - `when` (M1-PR4): a condition tree evaluated by
//     `evaluateVisibility`. Supports eq/neq/in/exists/truthy/not/
//     all/any over dot-paths into `context`.
//
// When both are set, BOTH must pass. The full predicate logic lives
// in `../schema/visibility.ts` so Studio overlays can reuse it.
function canRender(node: SaunaNodeConfig, context: SaunaContext | undefined): boolean {
  return evaluateVisibility(node.visibility, context);
}

function resolveProps(
  rawProps: Record<string, unknown> | undefined,
  context: SaunaContext | undefined
) {
  const raw = rawProps ?? {};
  // No author JavaScript, no raw HTML (SDL-681): `dangerouslySetInnerHTML`,
  // `srcDoc`, `onXxx` and every `href`/`src` outside http(s)/mailto/tel/
  // relative (`data:image/*` in a src) are dropped before anything else reads
  // the props — the primitives spread unknown props onto their root element.
  const next: Record<string, unknown> = { ...stripUnsafeProps(raw) };

  // mlfile: references (SDL-624) — a prop whose WHOLE value is a file
  // reference becomes the URL `context.file` answers with. No resolver, or a
  // file it does not know: the prop is DELETED, so `Image` draws its empty
  // frame. The reference string itself never reaches `<img src>` — a
  // visitor's browser would request `mlfile:…` from the page's host.
  // Params of a `Ref` are already written into the block's props by the time
  // this runs on the block's nodes (see `renderRef`), so a picture handed
  // down as a parameter resolves here too.
  for (const [key, value] of Object.entries(next)) {
    const fileId = parseFileRef(value);
    if (fileId === null) continue;
    const url = context?.file?.(fileId)?.url;
    // The host's resolver is code we do not own: its URL is checked too (SDL-681).
    if (url && stripUnsafeProps({ [key]: url })[key] !== undefined) next[key] = url;
    else delete next[key];
  }

  // href: через context.link
  if (typeof next.href === "string" && context?.link) {
    next.href = context.link(next.href);
    // The host's link mapper is code we do not own: check what it returned.
    if (typeof next.href === "string" && stripUnsafeProps({ href: next.href }).href === undefined) delete next.href;
  }

  // icon: если строка, пробуем резолвить через context.icons
  if (typeof next.icon === "string" && context?.icons?.[next.icon]) {
    next.icon = context.icons[next.icon];
  }

  return next;
}
