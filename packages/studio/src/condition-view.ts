// Shared "flat-view" representation of a VisibilityCondition used by
// the Studio editors. The visibility condition tree (eq/neq/in/exists/
// truthy/not/all/any) is convenient for the runtime evaluator but
// awkward for inline form editing — store the user's literal text
// separately so retyping "5" with kind=number doesn't lose the
// boundary between "the value the user typed" and "the value we
// persisted".
//
// Extracted in M2-PR9c so the variants editor can share the same
// inline `when` builder with the visibility editor. Behaviour is
// unchanged — visibility-editor.tsx now imports these instead of
// declaring its own copies.

import type { SaunaJSONPrimitive, VisibilityCondition } from "@markerloop/engine";
import type { PreviewContextField, PreviewContextSchema } from "./preview-context-editor";

export type EditorOp = "eq" | "neq" | "exists" | "truthy";
export type LiteralKind = "string" | "number" | "boolean";

export type ConditionView = {
  op: EditorOp;
  path: string;
  literalKind: LiteralKind;
  literalText: string;
};

export function emptyConditionView(): ConditionView {
  return { op: "eq", path: "", literalKind: "string", literalText: "" };
}

export function whenToView(when: VisibilityCondition | undefined): ConditionView {
  if (!when) return emptyConditionView();

  switch (when.op) {
    case "eq":
    case "neq":
      return {
        op: when.op,
        path: when.path,
        literalKind: detectLiteralKind(when.value),
        literalText: literalToText(when.value),
      };
    case "exists":
    case "truthy":
      return {
        op: when.op,
        path: when.path,
        literalKind: "string",
        literalText: "",
      };
    default:
      // Unsupported op in the MVP editor — fall back to a fresh state
      // rather than crashing. Authors with hand-edited in/not/all/any
      // see the editor reset on Add; the JSON itself is preserved
      // unless they explicitly Remove.
      return emptyConditionView();
  }
}

export function viewToWhen(view: ConditionView): VisibilityCondition {
  switch (view.op) {
    case "exists":
    case "truthy":
      return { op: view.op, path: view.path };
    case "eq":
    case "neq":
      return {
        op: view.op,
        path: view.path,
        value: parseLiteral(view.literalText, view.literalKind),
      };
  }
}

function parseLiteral(text: string, kind: LiteralKind): SaunaJSONPrimitive {
  switch (kind) {
    case "string":
      return text;
    case "number": {
      const n = Number(text);
      return Number.isFinite(n) ? n : 0;
    }
    case "boolean":
      return text === "true";
  }
}

function literalToText(v: SaunaJSONPrimitive): string {
  if (v === null) return "";
  return String(v);
}

function detectLiteralKind(v: SaunaJSONPrimitive): LiteralKind {
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  return "string";
}

/**
 * Flatten a stored `when` into the list of rules the editor shows.
 *
 * The board draws visibility as a LIST — «+ Add rule» sits under the filled
 * one (SDL-377) — while the stored shape is a single condition until there
 * are two, and then an `all` node. The two forms are the same rule set, so
 * the conversion lives here next to the other view/store translations rather
 * than in the editor.
 *
 * Only `all` is unfolded. `any` / `not` / `in` are authored by hand (the
 * editor has never offered them), and unfolding them would let a two-click
 * edit rewrite an OR into an AND without saying so — they stay a single
 * opaque row, exactly as before.
 */
export function conditionList(when: VisibilityCondition | undefined): VisibilityCondition[] {
  if (!when) return [];
  return when.op === "all" ? when.conditions : [when];
}

/** Inverse of {@link conditionList}: one rule stays flat, several become `all`. */
export function listToWhen(list: VisibilityCondition[]): VisibilityCondition | undefined {
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  return { op: "all", conditions: list };
}

/** Whether the editor can render every rule of this set as its own form. */
export function isEditableList(when: VisibilityCondition | undefined): boolean {
  return conditionList(when).every(
    (c) => c.op === "eq" || c.op === "neq" || c.op === "exists" || c.op === "truthy",
  );
}

/**
 * Render a one-line summary of a condition for list rows.
 * `user.role = "admin"`, `locale = "kk"`, etc. Returns an empty
 * string for the empty view so callers can show a placeholder.
 */
export function summariseCondition(when: VisibilityCondition | undefined): string {
  if (!when) return "always";
  switch (when.op) {
    case "eq":
      return `${when.path} = ${JSON.stringify(when.value)}`;
    case "neq":
      return `${when.path} ≠ ${JSON.stringify(when.value)}`;
    case "exists":
      return `${when.path} exists`;
    case "truthy":
      return `${when.path} is truthy`;
    case "in":
      return `${when.path} in ${JSON.stringify(when.values)}`;
    case "not":
      return `not (${summariseCondition(when.condition)})`;
    case "all":
      return when.conditions.map(summariseCondition).join(" AND ");
    case "any":
      return when.conditions.map(summariseCondition).join(" OR ");
  }
}

/* ------------------------------------------------------------------ */
/* Declared context fields                                            */
/* ------------------------------------------------------------------ */
//
// The host declares the shape of its preview context (SDL-193): a flat list
// of fields, each with a kind and — for enums — its options. A rule's `path`
// is a key into exactly that list, so when the field is declared the editor
// knows the literal's type without asking the author. That is why the
// approved canvas draws no "Type" control next to the value: with a declared
// field there is nothing to choose. Undeclared paths keep the free-form
// text + kind pair they have always had.

/** The declaration a rule's path points at, or `undefined` if it is ad-hoc. */
export function contextFieldFor(
  path: string,
  schema: PreviewContextSchema | undefined,
): PreviewContextField | undefined {
  if (!path) return undefined;
  return schema?.fields.find((f) => f.path === path);
}

/** The editor's literal kind implied by a declaration. Enums are strings. */
export function literalKindOf(field: PreviewContextField): LiteralKind {
  switch (field.kind) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
    case "enum":
      return "string";
  }
}

/**
 * The literal a freshly picked field should start from: the first enum
 * option, `true` for a boolean, empty otherwise. Picking `user.role` must
 * not leave `true` — the text carried over from a boolean field — sitting in
 * a value control that can only hold one of the declared options.
 */
export function defaultLiteralText(field: PreviewContextField): string {
  switch (field.kind) {
    case "enum":
      return field.options[0] ?? "";
    case "boolean":
      return "true";
    case "number":
    case "string":
      return "";
  }
}
