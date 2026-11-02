// Orphaned block parameters (SDL-501, EP-61).
//
// Hard rule 7 in one sentence: an override whose path stopped matching
// MUST NOT fall away silently. Parameters are exactly such an override
// — the page addresses a field of a block by NAME, the block decides
// what that name points at, and the two halves are edited by different
// people at different times. When they stop agreeing, the page's value
// has nowhere to go, and the cheap thing to do is drop it and render
// the block's own value. That looks like nothing happened, which is
// the failure this module exists to make loud.
//
// Everything here REPORTS. Nothing here rejects, repairs or filters:
// - the validator (`validate.ts`) deliberately ACCEPTS an orphan, so
//   the author keeps the door to the editor where the orphan is fixed;
// - the readers (`refs.ts`) deliberately return what is stored, so a
//   reader never becomes the place a value quietly disappears.
// The warning is the third position, and the only honest one: keep the
// data, keep the door open, and say out loud that something is wrong.
//
// Pure and server-safe: no React, no DOM, no I/O.

import type { SaunaNodeConfig, SaunaNodeId, SaunaSchema } from "../schema/types";
import {
  SAUNA_REF_BLOCK_ID_PROP,
  SAUNA_REF_PARAMS_PROP,
  blockParamSpecs,
  isRefNode,
  type SaunaBlockMap,
} from "./refs";

/**
 * What went wrong, as a machine-readable code. The UI (SDL-503/504)
 * picks the wording and the place; the code is what it branches on.
 *
 * - `orphan-spec` — the BLOCK's manifest declares a parameter pointing
 *   at a node that no longer exists in the block.
 * - `orphan-value` — the PAGE passes a value under a name the block
 *   does not declare. This is the case hard rule 7 describes: the
 *   author typed a value, then the block changed underneath it.
 */
export type SaunaParamWarningCode = "orphan-spec" | "orphan-value";

/**
 * One orphan, with enough context to point a human at it.
 *
 * `nodeId` means different things per code and that is deliberate:
 * for `orphan-spec` it is the missing node the manifest names (the
 * thing to look for), for `orphan-value` it is the `Ref` node on the
 * page carrying the value (the thing to click).
 */
export type SaunaParamWarning = {
  code: SaunaParamWarningCode;
  /** Parameter name — the identity both halves agree on, when they do. */
  name: string;
  nodeId: SaunaNodeId;
  /** Block the ref points at. Absent on `orphan-spec`: it IS the block. */
  blockId?: string;
  /** Variant that carries the value, when it is not the node's own props. */
  variantId?: string;
  /** Plain-language reason, safe to show as-is. */
  message: string;
};

/**
 * Orphans in a block's OWN manifest: specs whose `spec.nodeId` is gone
 * from `schema.nodes`.
 *
 * **A missing `spec.prop` key is NOT an orphan, on purpose.** Clearing
 * a field in the editor deletes the key (`updateNodePropsPartial`
 * drops `undefined`), so "no such key" is the ordinary state of a
 * field left at the component's default — and the parameter still
 * works, because the resolver writes the page's value into that prop
 * whether or not something was there before. Flagging it would fire on
 * healthy documents, and a warning that cries wolf is worse than no
 * warning: the author learns to click it away.
 */
export function blockParamOrphans(schema: SaunaSchema): SaunaParamWarning[] {
  const warnings: SaunaParamWarning[] = [];
  for (const spec of blockParamSpecs(schema)) {
    if (schema.nodes[spec.nodeId]) continue;
    warnings.push({
      code: "orphan-spec",
      name: spec.name,
      nodeId: spec.nodeId,
      message:
        `Parameter "${spec.label ?? spec.name}" points at an element this component ` +
        `no longer has. Pages that set a value for it will not apply it.`,
    });
  }
  return warnings;
}

/** Every props-bearing branch of a node: its own props, then each variant's. */
function paramBranches(
  node: SaunaNodeConfig,
): Array<{ props: Record<string, unknown> | undefined; variantId?: string }> {
  return [
    { props: node.props },
    ...(node.variants ?? []).map((variant) => ({
      props: variant.props,
      variantId: variant.id,
    })),
  ];
}

function blockIdOf(props: Record<string, unknown> | undefined): string | null {
  const raw = props?.[SAUNA_REF_BLOCK_ID_PROP];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function paramMapOf(
  props: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  const raw = props?.[SAUNA_REF_PARAMS_PROP];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * Orphans on a PAGE: values a `Ref` passes under names its block does
 * not declare.
 *
 * Walks variants as well as the node's own props, for the same reason
 * `collectRefBlockIds` does: a value hidden behind a variant that only
 * renders for some visitors is still a value the author typed and still
 * one that will not arrive. A warning is a diagnosis, not a render
 * decision, so it does not get to be context-clever.
 *
 * **A block missing from `blocks` produces NO warning.** "Not loaded"
 * and "does not declare this parameter" look identical from here, and
 * only one of them is the author's problem. Reporting the pair as an
 * orphan would turn every slow fetch into a false alarm about data that
 * is perfectly fine on disk. The unresolvable ref itself is already
 * surfaced by the renderer's placeholder (SDL-338).
 */
export function refParamOrphans(
  schema: SaunaSchema,
  blocks: SaunaBlockMap,
): SaunaParamWarning[] {
  const warnings: SaunaParamWarning[] = [];
  for (const [nodeId, node] of Object.entries(schema.nodes)) {
    if (!isRefNode(node)) continue;
    const ownBlockId = blockIdOf(node.props);
    for (const branch of paramBranches(node)) {
      const values = paramMapOf(branch.props);
      if (!values) continue;
      const blockId = blockIdOf(branch.props) ?? ownBlockId;
      if (!blockId) continue;
      const block = blocks[blockId];
      if (!block) continue;
      const declared = new Set(blockParamSpecs(block).map((spec) => spec.name));
      for (const name of Object.keys(values)) {
        if (declared.has(name)) continue;
        warnings.push({
          code: "orphan-value",
          name,
          nodeId,
          blockId,
          ...(branch.variantId ? { variantId: branch.variantId } : {}),
          message:
            `This page sets the parameter "${name}", but the component no longer ` +
            `declares it — the value will not be applied.`,
        });
      }
    }
  }
  return warnings;
}

/**
 * Both halves at once — what a screen showing one document wants.
 *
 * Manifest orphans come first: a spec pointing at a deleted node is
 * the cause, and the page values orphaned by it are the consequence.
 * Fixing the block usually clears several page warnings, so an author
 * reading top-down does the useful edit first.
 */
export function collectParamWarnings(
  schema: SaunaSchema,
  blocks: SaunaBlockMap = {},
): SaunaParamWarning[] {
  return [...blockParamOrphans(schema), ...refParamOrphans(schema, blocks)];
}
