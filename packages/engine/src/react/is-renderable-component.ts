// Single definition of "what counts as a renderable component" shared by
// createSaunaRegistry and createSaunaComponentCatalog. The two surfaces
// MUST agree: the catalog decides what Studio offers for insertion, the
// registry decides what the renderer resolves. Any divergence produces a
// block that can be inserted but renders nothing (silently — the renderer
// returns null for unknown types).
//
// forwardRef/memo components are exotic objects, not functions, so a bare
// `typeof value === "function"` check drops them: `Button` (forwardRef)
// was invisible to both surfaces until SDL-102. Symbol.for is used instead
// of instanceof-style identity so the check survives the CJS+ESM dual
// build (hard rule 5) and multiple React copies.

const REACT_FORWARD_REF = Symbol.for("react.forward_ref");
const REACT_MEMO = Symbol.for("react.memo");

export function isRenderableComponent(name: string, value: unknown): boolean {
  if (!/^[A-Z]/.test(name)) return false;
  if (typeof value === "function") return true;
  if (typeof value === "object" && value !== null) {
    const tag = (value as { $$typeof?: symbol }).$$typeof;
    return tag === REACT_FORWARD_REF || tag === REACT_MEMO;
  }
  return false;
}
