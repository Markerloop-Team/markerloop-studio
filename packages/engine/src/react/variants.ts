// Variants resolver (M2-PR9b).
//
// Selects one body for a node based on its `variants[]` and the live
// `SaunaContext`. Pure, synchronous, side-effect-free — called by the
// renderer once per node, after the visibility gate. See the internal design notes.
//
// First-match semantics: variants are iterated in array order, and the
// first whose `when` rule evaluates true wins. The node's own
// `props` / `children` are the implicit fallback when zero variants
// match — that's what keeps existing JSONs with `visibility`-only
// behaviour working unchanged.
//
// `props` from a matched variant are shallow-merged over the node's
// default props. `children` from a matched variant fully replace the
// node's default children when present, or fall back to the default
// when omitted — see the per-field reasoning at the merge site.

import type { SaunaNodeConfig, SaunaNodeId, VariantSpec } from "../schema/types";
import { saunaLayerNodeProps } from "../core/visibility-mode";
import { evaluateVisibility, saunaAudience } from "./visibility";
import type { SaunaContext } from "./types";

export type ResolveNodeBodyOptions = {
  /**
   * Lay `member.props` over the base (SDL-632). The renderer passes it: true
   * for a member when the mode in force at the node — its own or its nearest
   * ancestor's — is `"hybrid"`. When omitted, only the node's OWN mode is
   * looked at, since a lone node has no ancestors in hand.
   */
  memberBranch?: boolean;
};

/**
 * Material body the renderer actually consumes: props to spread into
 * the React component and the list of child node ids to recurse into.
 * Identity-stable when no variant matched (returns `node.props` /
 * `node.children` references unchanged), so we don't allocate
 * needlessly on every render.
 */
export type ResolvedNodeBody = {
  props: Record<string, unknown> | undefined;
  children: SaunaNodeId[] | undefined;
  /**
   * The variant that produced this body, or `undefined` when the
   * fallback was used. Exposed for Studio "which variant matched"
   * debug badges; the renderer itself ignores it.
   */
  matchedVariant: VariantSpec | undefined;
};

/**
 * Resolve a node's effective body against the current context.
 *
 * The renderer is expected to have already gated the node through
 * `visibility` — this function does NOT re-check visibility.
 * Layering the two responsibilities keeps the contract one-job-one-
 * function and makes it cheap to test each in isolation.
 */
export function resolveNodeBody(
  node: SaunaNodeConfig,
  context: SaunaContext | undefined,
  options: ResolveNodeBodyOptions = {}
): ResolvedNodeBody {
  // SDL-632 layers first: props < member.props < screens[screen].props.
  // The legacy conditional variant goes on top of the result.
  // Identity-stable: `node.props` itself when no layer applies.
  const memberBranch =
    options.memberBranch ?? (node.visibility === "hybrid" && saunaAudience(context) === "member");
  const baseProps = saunaLayerNodeProps(node, { member: memberBranch, screen: context?.screen });

  const variants = node.variants;
  if (!variants || variants.length === 0) {
    return {
      props: baseProps,
      children: node.children,
      matchedVariant: undefined,
    };
  }

  for (const variant of variants) {
    if (evaluateVisibility(variant.when, context)) {
      return {
        // Shallow merge: variant overrides win field-by-field. Deep
        // merge would surprise authors who expect "object props
        // replace, not merge" — keep it predictable and explicit.
        // Authors who need to keep some node-level fields and
        // override others list them out per-variant.
        props:
          variant.props !== undefined
            ? { ...(baseProps ?? {}), ...variant.props }
            : baseProps,
        // `undefined` here means "variant didn't specify children" —
        // fall back to the node's default. Distinguish from `[]`
        // (empty array), which is an explicit "no children" override.
        children:
          variant.children !== undefined ? variant.children : node.children,
        matchedVariant: variant,
      };
    }
  }

  // No variant matched — render the node's default body. This is the
  // path that keeps `visibility`-only nodes (no `variants` declared
  // OR declared but all conditions false) behaving exactly as before
  // M2-PR9.
  return {
    props: baseProps,
    children: node.children,
    matchedVariant: undefined,
  };
}
