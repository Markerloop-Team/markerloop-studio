// Visibility rule evaluator.
//
// One function — `evaluateVisibility` — answers: "given this rule and
// this context, should the node render?". Everything else in this
// file is private support: a dot-path resolver and a recursive
// condition walker.
//
// Semantics:
//
//   - If `rule` is undefined, the node renders. No rule = no
//     restriction.
//   - A visibility MODE string (SDL-632): `"public"` and `"hybrid"`
//     render for everyone, `"private"` for a member only (see
//     `saunaAudience`). Any other string hides the node — fail closed.
//     Modes are access control; the server also cuts private nodes out
//     of the public shell (`core/public-shell.ts`), this is the second
//     half of that guard for whatever reaches the renderer.
//   - If `rule.permission` is set, it is checked first via
//     `context.can(permission)`. Missing `can` is fail-closed —
//     callers who use the legacy `permission` field must wire a
//     predicate; otherwise we hide rather than show.
//   - If `rule.when` is set, the condition tree is walked. A
//     condition resolving to false (or to undefined, when treated as
//     boolean) hides the node.
//   - When both are set, BOTH must pass. Logical AND.
//
// Path resolution:
//
//   `"user.role"` resolves against the `SaunaContext` object
//   the consumer passes to <SaunaProvider>. Paths are dot-separated;
//   array indices are not supported in M1 (model nested arrays via
//   custom context fields the host pre-flattens). Missing
//   intermediate keys resolve to `undefined`, not an error.
//
// The evaluator is **pure** — no I/O, no async. Safe to call inside
// render.

import type {
  SaunaJSONPrimitive,
  SaunaNodeVisibility,
  VisibilityCondition,
} from "../schema/types";
import type { SaunaAudience, SaunaContext } from "./types";

/**
 * Who is looking: `context.audience` when it names one, else `"member"` for a
 * context with a `user` and `"guest"` for one without.
 */
export function saunaAudience(context: SaunaContext | undefined): SaunaAudience {
  const explicit = context?.audience;
  if (explicit === "guest" || explicit === "member") return explicit;
  return context?.user ? "member" : "guest";
}

/**
 * Read `path` from `context`. Returns the value at the leaf or
 * `undefined` if any intermediate key is missing / nullish.
 *
 * Exported for tests and per-instance debugging tools — most
 * consumers use `evaluateVisibility` instead.
 */
export function resolvePath(context: SaunaContext | undefined, path: string): unknown {
  if (!context || !path) return undefined;
  const parts = path.split(".");
  let cur: unknown = context;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Walks a condition tree and returns true if it matches the context.
 *
 * Exported separately from `evaluateVisibility` so consumers can
 * evaluate ad-hoc conditions outside of a node — e.g. inside Studio
 * preview overlays that mirror runtime behaviour.
 */
export function evaluateCondition(
  cond: VisibilityCondition,
  context: SaunaContext | undefined
): boolean {
  switch (cond.op) {
    case "eq":
      return resolvePath(context, cond.path) === cond.value;
    case "neq":
      return resolvePath(context, cond.path) !== cond.value;
    case "in": {
      const v = resolvePath(context, cond.path) as SaunaJSONPrimitive;
      return cond.values.includes(v);
    }
    case "exists":
      return resolvePath(context, cond.path) !== undefined;
    case "truthy":
      return Boolean(resolvePath(context, cond.path));
    case "not":
      return !evaluateCondition(cond.condition, context);
    case "all":
      return cond.conditions.every((c) => evaluateCondition(c, context));
    case "any":
      return cond.conditions.some((c) => evaluateCondition(c, context));
  }
}

/**
 * Top-level entry point. Returns true iff the node should render.
 *
 * Fail-closed on permission: if `rule.permission` is set but the
 * context has no `can` predicate, the node is hidden. Authors who
 * gate by permission must wire a `can` function in the
 * <SaunaProvider>.
 */
export function evaluateVisibility(
  rule: SaunaNodeVisibility | undefined,
  context: SaunaContext | undefined
): boolean {
  if (rule === undefined || rule === null) return true;

  // Visibility modes (SDL-632). Checked before the malformed-shape guard
  // below, which still hides every OTHER string.
  if (typeof rule === "string") {
    if (rule === "public" || rule === "hybrid") return true;
    if (rule === "private") return saunaAudience(context) === "member";
    return false;
  }

  // A rule that is not a plain object is MALFORMED, and the node stays
  // hidden. It is the one place in the engine where being lenient is not
  // an option: every field of `VisibilityRule` reads `undefined` on a
  // string, an array or a number, so a lenient evaluator walks past both
  // checks below and returns `true` — a node whose author asked for it to
  // be restricted renders to everyone, silently, with nothing red anywhere.
  //
  // Found 23 Sep 2026 while scoping the three-mode visibility of SDL-595.
  // Since SDL-632 the three mode strings are read above; everything else
  // that is not a plain object — an unknown string, a number, an array —
  // still lands here. `validateSaunaSchema` rejects such a node at the
  // door; this is the second half of the same guard, for a document that
  // reached the renderer without passing through it.
  if (typeof rule !== "object" || Array.isArray(rule)) return false;

  if (rule.permission !== undefined) {
    if (context?.can?.(rule.permission) !== true) return false;
  }

  if (rule.when !== undefined) {
    if (!evaluateCondition(rule.when, context)) return false;
  }

  return true;
}
