// Which prop of a node produced the text on the canvas (SDL-299, EP-48).
//
// Inline editing needs an answer to one question before it can write
// anything: the author double-clicked a heading and typed — WHICH key on
// `node.props` is that text?
//
// The tempting answers are both wrong here.
//
//   - Hard-code a table `type → prop`. It holds for exactly the six local
//     primitives and breaks the moment the registry is the kit (SDL-295).
//   - Read the prop out of the kit's props manifest (SDL-293). The manifest
//     describes the KIT; the canvas draws the HOST's registry. Their names
//     collide at different shapes — the local `Button` takes `label`, the
//     kit's takes `children` — so a manifest lookup would confidently write
//     into a prop the rendered component does not have. That is the same
//     trap SDL-293 documented, taken from the other side.
//
// The answer used instead depends on neither, and proves itself: the text
// prop is the string prop whose VALUE EQUALS the element's `textContent`.
// Equality is the evidence. Any other source of that text — several props
// concatenated by the component, a computed string, children nodes — cannot
// produce an exact match, so a wrong guess cannot be committed: the resolver
// declines and the author keeps the properties panel.

import type { SaunaNodeConfig } from "@markerloop/engine";

/**
 * Props that carry a string but are not the element's text content.
 *
 * Without this, `Link` authored as `{ href: "/pricing" }` renders "/pricing"
 * (the registry falls back to the href when there is no text), the href
 * matches the rendered text exactly, and inline editing would offer to
 * "edit the text" — silently rewriting the destination of the link.
 */
const NON_TEXT_PROPS: ReadonlySet<string> = new Set([
  "href",
  "src",
  "action",
  "name",
  "id",
  "className",
  "style",
  "type",
]);

/**
 * Preference when several props hold the SAME string, so equality alone
 * cannot separate them (`{ text: "Hi", children: "Hi" }`).
 *
 * The order mirrors what the renderer itself prefers — every primitive
 * renders `children ?? text` / `children ?? label` — so the prop we write is
 * the prop that would win on the next render. Anything not listed sorts
 * after these, alphabetically, so the choice stays deterministic.
 */
const TEXT_PROP_PREFERENCE: readonly string[] = [
  "children",
  "text",
  "label",
  "title",
  "caption",
];

export type CanvasTextTarget = {
  /** Key on `node.props` to write the edited string back into. */
  prop: string;
  /** Its current value — the text the author starts editing from. */
  value: string;
};

function rank(name: string): number {
  const i = TEXT_PROP_PREFERENCE.indexOf(name);
  return i === -1 ? TEXT_PROP_PREFERENCE.length : i;
}

/**
 * Resolves the prop holding `renderedText` for `node`, or `null` when the
 * node's text is not editable in place.
 *
 * `null` is returned — deliberately, not as a failure — when:
 *
 *   - the node has children in the schema: its text comes from child NODES,
 *     and writing it into a prop would bury them;
 *   - the node has variants: the canvas is showing a resolved body, while a
 *     write lands on the base props, so the edit would appear not to apply
 *     (see `resolveNodeBody` in the renderer);
 *   - no string prop equals the rendered text: whatever produced it is not a
 *     single prop of ours to edit.
 *
 * `allowedProps` narrows the candidate set to an explicit allowlist — the PO
 * editor (SDL-367) passes the section's `content: true` text fields so an
 * inline edit can only ever land on a prop the content panel also offers.
 * Omitted, every string prop is a candidate (the Studio's behaviour). The
 * equality evidence and the deny-list still apply either way: the allowlist
 * says which props MAY receive text, not that one of them DID produce it.
 */
export function resolveCanvasTextTarget(
  node: SaunaNodeConfig | undefined,
  renderedText: string,
  allowedProps?: readonly string[]
): CanvasTextTarget | null {
  if (!node) return null;
  if (node.children && node.children.length > 0) return null;
  if (node.variants && node.variants.length > 0) return null;

  const props = node.props ?? {};
  const wanted = renderedText.trim();

  const matches = Object.keys(props)
    .filter((key) => allowedProps === undefined || allowedProps.includes(key))
    .filter((key) => !NON_TEXT_PROPS.has(key))
    .filter((key) => typeof props[key] === "string")
    .filter((key) => (props[key] as string).trim() === wanted);

  if (matches.length === 0) return null;

  // Several matches are by construction the same string, so any of them is
  // correct; `rank` only decides which one the next render would read back.
  const prop = matches.sort((a, bKey) => rank(a) - rank(bKey) || a.localeCompare(bKey))[0]!;
  return { prop, value: props[prop] as string };
}
