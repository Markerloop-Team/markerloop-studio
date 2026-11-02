// Substituting a page's parameter values into a block (SDL-502, EP-61).
//
// The half that finally makes parameters do something. Storage landed
// in SDL-500, the orphan report in SDL-501, and only now — with the
// report in place — is it safe to substitute, because substitution is
// where a value can go missing. Hard rule 7 does not forbid dropping a
// value; it forbids dropping one SILENTLY, and the silence was fixed
// first, on purpose.
//
// What the author sees: a parameter left empty renders the spec's
// `default` when it declares one (SDL-718), else the block's own value; a
// parameter filled in renders the page's — on that page only.
// Editing the block still reaches every page that references it, which
// is the whole reason a page holds VALUES and never a copy.
//
// Pure and server-safe: no React, no DOM, no I/O.

import type { SaunaSchema } from "../schema/types";
import { saunaParamSpecIssues } from "../schema/params";
import { blockParamSpecs } from "./refs";

/**
 * The block as this page wants it: `values` written into the props the
 * block's manifest exposes.
 *
 * A parameter the page sets no value for (no key in `values`) takes the
 * spec's `default` when it declares one (SDL-718) — and keeps the value the
 * prop holds inside the block when it does not. A `default` that breaks the
 * typed contract (a number for a `"boolean"`, a select value outside its
 * options — possible only in a document written past the validator) is
 * ignored rather than rendered: the write path refuses it, the read path
 * must not put it on screen.
 *
 * Returns the ORIGINAL object when nothing applies — no manifest, no
 * values and no defaults, or no name in common. The renderer calls this on
 * every ref on every render, and the overwhelmingly common case is a block
 * nobody parameterised; identity-stability keeps that case free, the same
 * way `resolveNodeBody()` avoids allocating when no variant matched.
 *
 * Three things it deliberately does NOT do:
 *
 * - **Apply a value with no matching spec.** There is nowhere to put it.
 *   This is the orphan `refParamOrphans()` reports; the drop is not
 *   silent because that function exists, which is why SDL-501 had to
 *   land before this one.
 * - **Apply a spec whose node is gone.** Same orphan, seen from the
 *   block's side (`blockParamOrphans()`).
 * - **Look at the value.** `undefined`, `null`, `""` and `0` are values
 *   the author typed and are written as given — a present key always wins
 *   over the default. "Empty means fall back" is a decision for the
 *   EDITOR — a field left untouched stores no key at all — and making it
 *   here would rob the author of any way to override a default with an
 *   empty string.
 */
export function applyBlockParams(
  block: SaunaSchema,
  values: Readonly<Record<string, unknown>> | null | undefined,
): SaunaSchema {
  const specs = blockParamSpecs(block);
  if (specs.length === 0) return block;

  let nodes: SaunaSchema["nodes"] | null = null;
  for (const spec of specs) {
    let value: unknown;
    if (values && Object.hasOwn(values, spec.name)) {
      value = values[spec.name];
    } else if (spec.default !== undefined && saunaParamSpecIssues(spec, "$").length === 0) {
      value = spec.default;
    } else {
      continue;
    }
    const source = nodes ?? block.nodes;
    const node = source[spec.nodeId];
    if (!node) continue;
    nodes ??= { ...block.nodes };
    nodes[spec.nodeId] = {
      ...node,
      props: { ...(node.props ?? {}), [spec.prop]: value },
    };
  }

  return nodes ? { ...block, nodes } : block;
}
