// Tiny Zod introspection helpers.
//
// We avoid importing Zod's classes directly so that the auto-form keeps
// working across Zod versions that move classes around — only the def
// shape is read. The def's type tag moved between majors:
//   - zod 3: `_def.typeName` — PascalCase class name ("ZodString")
//   - zod 4: `_def.type`     — lowercase kind ("string")
// `tagOf()` normalizes both to the lowercase form. Reading only
// `typeName` after the zod-4 migration made every tag undefined, so
// every field silently fell through to the JSON-textarea fallback —
// the typed editors (text/number/boolean/enum) never rendered.
// Caught by the SDL-104 safety net; keep both branches.

import type { ZodTypeAny } from "zod";

type Def = {
  /** zod 3 tag ("ZodString"). */
  typeName?: string;
  /** zod 4 tag ("string"). */
  type?: unknown;
  innerType?: ZodTypeAny;
  /** zod 3 enum values. */
  values?: readonly string[];
  /** zod 4 enum entries ({ a: "a" }). */
  entries?: Record<string, string | number>;
  options?: ZodTypeAny[];
};

function defOf(schema: ZodTypeAny): Def {
  return (schema as unknown as { _def: Def })._def ?? {};
}

/** Normalized lowercase type tag, or undefined when unrecognizable. */
function tagOf(def: Def): string | undefined {
  if (typeof def.type === "string") return def.type;
  if (typeof def.typeName === "string") {
    // "ZodNativeEnum" → "nativeenum", "ZodString" → "string"
    return def.typeName.replace(/^Zod/, "").toLowerCase();
  }
  return undefined;
}

const WRAPPER_TAGS = new Set([
  "optional",
  "nullable",
  "default",
  "prefault",
  "readonly",
  "branded",
  "brand",
  "catch",
]);

/**
 * Strip `Optional` / `Nullable` / `Default` / `Readonly` wrappers and
 * return the inner schema. Useful for editor selection — we render
 * the same control for `z.string()` and `z.string().optional()`.
 */
export function unwrapZod(schema: ZodTypeAny): ZodTypeAny {
  let s: ZodTypeAny = schema;
  // Bound to avoid pathological cyclic schemas locking the form thread.
  for (let i = 0; i < 16; i++) {
    const def = defOf(s);
    const tag = tagOf(def);
    if (tag && WRAPPER_TAGS.has(tag)) {
      const inner = def.innerType;
      if (!inner) return s;
      s = inner;
      continue;
    }
    return s;
  }
  return s;
}

export type ZodKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "literal"
  | "object"
  | "array"
  | "unknown";

/**
 * Classify a Zod schema for editor selection. Walks through the same
 * wrapper set as `unwrapZod`.
 */
export function zodKind(schema: ZodTypeAny): ZodKind {
  switch (tagOf(defOf(unwrapZod(unionEnum(schema) ?? schema)))) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "enum":
    case "nativeenum":
      return "enum";
    case "literal":
      return "literal";
    case "object":
      return "object";
    case "array":
      return "array";
    default:
      return "unknown";
  }
}

/**
 * The enum option of a union, if it has one — a colour prop (SDL-950) is
 * `z.union([z.enum(builtins), themeColorKey])`: the panel offers the built-in
 * values, the theme's own colours come from the theme, not the schema.
 */
function unionEnum(schema: ZodTypeAny): ZodTypeAny | undefined {
  const def = defOf(unwrapZod(schema)) as Def & { options?: ZodTypeAny[] };
  if (tagOf(def) !== "union" || !Array.isArray(def.options)) return undefined;
  return def.options.find((o) => {
    const t = tagOf(defOf(unwrapZod(o)));
    return t === "enum" || t === "nativeenum";
  });
}

/** Extract `values` from an enum schema (zod 3 `values`, zod 4 `entries`); a union's enum option too. */
export function enumValues(schema: ZodTypeAny): readonly string[] {
  const def = defOf(unwrapZod(unionEnum(schema) ?? schema));
  if (def.values) return def.values;
  if (def.entries) return Object.values(def.entries).map(String);
  return [];
}

/**
 * For an object schema, return its `shape` (each entry is itself a Zod
 * schema). Returns null for non-object schemas.
 */
export function objectShape(schema: ZodTypeAny): Record<string, ZodTypeAny> | null {
  const inner = unwrapZod(schema);
  if (tagOf(defOf(inner)) !== "object") return null;
  const shape = (inner as unknown as { shape?: Record<string, ZodTypeAny> }).shape;
  if (shape && typeof shape === "object") return shape;
  return null;
}
