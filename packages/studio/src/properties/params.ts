// Authoring a component's parameter manifest (SDL-503, EP-61).
//
// The editor half of what SDL-500 stored and SDL-502 resolves. Everything
// here is pure list arithmetic over `SaunaParamSpec[]` — no React, no store,
// no I/O — so the rules a name has to satisfy are testable without mounting
// a panel, and the panel is left with nothing but the click.
//
// The one rule worth stating out loud: a parameter is addressed by NAME.
// `refParamValues()` hands the resolver `{ [name]: value }` and
// `applyBlockParams()` looks the name up in the manifest — so the name is
// the contract between a page and a block, and renaming one is a breaking
// change to every page that filled it in. That is why adding is the only
// edit offered here: rename would silently orphan values on pages this
// editor cannot see, which is exactly what hard rule 7 forbids.

import type { SaunaNodeId, SaunaParamSpec } from "@markerloop/engine";

/** Why a proposed parameter name was rejected. */
export type SaunaParamNameError = "empty" | "whitespace" | "duplicate";

export type SaunaParamAddResult =
  | { ok: true; params: SaunaParamSpec[] }
  | { ok: false; error: SaunaParamNameError };

/**
 * The parameter currently exposing this node's prop, if any.
 *
 * A field carries at most one: two names for one prop would let a page
 * write both and leave the resolver to pick, and it picks by manifest
 * order — an outcome nobody authored. {@link addParam} enforces it.
 */
export function paramFor(
  params: readonly SaunaParamSpec[],
  nodeId: SaunaNodeId,
  prop: string,
): SaunaParamSpec | undefined {
  return params.find((p) => p.nodeId === nodeId && p.prop === prop);
}

/**
 * A name to prefill the field with: the prop's own name, suffixed until it
 * is free (`title`, `title-2`, `title-3`).
 *
 * Suggesting rather than imposing — the author renames it in the input
 * before confirming, because the prop name is the block's vocabulary and
 * the parameter name is the page's.
 */
export function suggestParamName(params: readonly SaunaParamSpec[], prop: string): string {
  const taken = new Set(params.map((p) => p.name));
  if (!taken.has(prop)) return prop;
  for (let n = 2; ; n += 1) {
    const candidate = `${prop}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Validates a proposed name against the manifest it would join.
 *
 * Whitespace INSIDE the name is rejected, not trimmed away: the name is a
 * key an author types on the page side too, and `hero title` vs
 * `hero  title` are two different keys that read as one. Surrounding
 * whitespace is trimmed — that is a typo, not a decision.
 */
export function checkParamName(
  params: readonly SaunaParamSpec[],
  name: string,
): SaunaParamNameError | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "empty";
  if (/\s/.test(trimmed)) return "whitespace";
  if (params.some((p) => p.name === trimmed)) return "duplicate";
  return null;
}

/**
 * Appends a parameter for `nodeId.prop`, or says why it cannot.
 *
 * Appends rather than inserts: manifest order is the order the author
 * declared parameters in, and the list section reads top-to-bottom in that
 * order. Re-parameterising a field that already has a name is a no-op
 * rather than an error — the panel does not offer the action in that
 * state, and a caller that gets there anyway must not create the second
 * name {@link paramFor} promises does not exist.
 */
export function addParam(
  params: readonly SaunaParamSpec[],
  spec: { name: string; nodeId: SaunaNodeId; prop: string },
): SaunaParamAddResult {
  if (paramFor(params, spec.nodeId, spec.prop)) return { ok: true, params: [...params] };
  const error = checkParamName(params, spec.name);
  if (error) return { ok: false, error };
  return {
    ok: true,
    params: [...params, { name: spec.name.trim(), nodeId: spec.nodeId, prop: spec.prop }],
  };
}

/**
 * Drops the parameter with this name.
 *
 * The block goes back to rendering its own value everywhere, and the
 * values pages had written become orphans — reported, never silently
 * dropped, by `refParamOrphans()` (SDL-501). Removing here does NOT reach
 * into pages to clean them: this editor has one document open and cannot
 * see the others, and a partial cleanup is worse than a full report.
 */
export function removeParam(
  params: readonly SaunaParamSpec[],
  name: string,
): SaunaParamSpec[] {
  return params.filter((p) => p.name !== name);
}

/**
 * Edits the label and the default of one parameter (SDL-721, canvas
 * /design-system/blocks/editor?case=edit). Name, node, prop and type are not
 * editable here: the name is the contract with every page, and the type
 * follows the field. `undefined` in the patch REMOVES the key (no label, no
 * default) rather than writing `undefined` into the stored JSON. An unknown
 * name returns the list unchanged.
 */
export function updateParam(
  params: readonly SaunaParamSpec[],
  name: string,
  patch: { label?: string; default?: SaunaParamSpec["default"] },
): SaunaParamSpec[] {
  return params.map((p) => {
    if (p.name !== name) return p;
    const next: SaunaParamSpec = { ...p };
    if ("label" in patch) {
      if (patch.label === undefined) delete next.label;
      else next.label = patch.label;
    }
    if ("default" in patch) {
      if (patch.default === undefined) delete next.default;
      else next.default = patch.default;
    }
    return next;
  });
}

/** Human-readable reason, for the inline error under the name input. */
export function paramNameErrorText(error: SaunaParamNameError): string {
  switch (error) {
    case "empty":
      return "Give the parameter a name.";
    case "whitespace":
      return "A parameter name cannot contain spaces.";
    case "duplicate":
      return "This component already has a parameter with that name.";
  }
}
