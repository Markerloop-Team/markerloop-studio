// Prop descriptors — the form spec the properties panel renders (SDL-293, EP-48).
//
// Until now the panel could only be built from a `BlockDefinition`'s zod
// schema, and zod has nowhere to put a group, an order, a caption or a
// "hide this one". Those live in the kit's props manifest instead
// (`packages/sunday-sauna/props-manifest.json`, SDL-290/291/292): one entry
// per component, already classified into an editor and a semantic group,
// already ordered — the overlay `saunaPropsMeta` is what reorders it.
//
// This module is the reader. It stays deliberately defensive: the manifest
// is a published artifact of a package that versions independently of the
// Studio, so an unknown group or editor must degrade (→ `advanced` / an
// editor derived from the type) rather than throw a panel away.

/** Semantic groups, in the order the panel stacks them. */
export const PROP_GROUPS = [
  "content",
  "appearance",
  "layout",
  "state",
  "advanced",
] as const;

export type PropGroup = (typeof PROP_GROUPS)[number];

/**
 * Section captions.
 *
 * These were English while the field labels beside them were Russian, and the
 * note here used to explain that split: "field labels come from the manifest
 * and follow the kit's own language". True when it was written — the kit spoke
 * Russian. It stopped being true at SDL-472/SDL-480, when the kit's language
 * became English, and nothing noticed for a week: the labels were in JSON, no
 * test read them, and this comment kept explaining a boundary that had moved.
 *
 * There is no split now. Captions here and labels in `sauna-props-meta.json`
 * are both English, and `pnpm lang:check` reds on Cyrillic in either (SDL-481).
 */
export const PROP_GROUP_LABELS: Record<PropGroup, string> = {
  content: "Content",
  appearance: "Appearance",
  layout: "Layout",
  state: "State",
  advanced: "Advanced",
};

/** Editors the manifest may name. `segmented` and `link` render through
 *  their plain cousins until SDL-294 ships the polished controls. */
export const PROP_EDITOR_KINDS = [
  "segmented",
  "select",
  "switch",
  "number",
  "text",
  "link",
] as const;

export type PropEditorKind = (typeof PROP_EDITOR_KINDS)[number];

export type PropValueType = "string" | "number" | "boolean" | "enum";

export type PropDescriptor = {
  /** Key on the node's `props`. */
  name: string;
  type: PropValueType;
  editor: PropEditorKind;
  group: PropGroup;
  required: boolean;
  /** Caption from the overlay; the panel falls back to `name`. */
  label?: string;
  /** TSDoc of the prop in the kit — shown as the field's hint. */
  description?: string;
  /** Component default. Shown as a placeholder and never written into the
   *  node: an empty field means "whatever the component does by default",
   *  so a kit upgrade reaches pages that were authored earlier. */
  default?: string | number | boolean;
  enumValues?: readonly string[];
  /** Set on props the node carries but the manifest does not describe —
   *  the component changed under an existing page. Shown in `advanced`
   *  with a badge instead of being dropped silently. */
  unknown?: boolean;
  /** Marked `content: true` in the kit's manifest (SDL-365): a field the
   *  product owner edits as page content — text, image source, link. The
   *  selection criterion of the content panel (SDL-366); absent means a
   *  settings prop. Authored in the kit's overlay, never inferred here. */
  content?: boolean;
};

export type SaunaPropsManifest = {
  package?: string;
  version?: string;
  components: Record<string, { props?: readonly unknown[] }>;
};

/** Structural check — the panel accepts any object shaped like a manifest,
 *  including one fetched at runtime rather than imported. */
export function isPropsManifest(value: unknown): value is SaunaPropsManifest {
  if (typeof value !== "object" || value === null) return false;
  const components = (value as { components?: unknown }).components;
  return typeof components === "object" && components !== null && !Array.isArray(components);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeType(raw: unknown, enumValues?: readonly string[]): PropValueType {
  if (enumValues && enumValues.length > 0) return "enum";
  return raw === "number" || raw === "boolean" || raw === "enum" ? raw : "string";
}

function editorForType(type: PropValueType): PropEditorKind {
  switch (type) {
    case "number":
      return "number";
    case "boolean":
      return "switch";
    case "enum":
      return "select";
    default:
      return "text";
  }
}

function normalizeEditor(raw: unknown, type: PropValueType): PropEditorKind {
  return (PROP_EDITOR_KINDS as readonly string[]).includes(raw as string)
    ? (raw as PropEditorKind)
    : editorForType(type);
}

function normalizeGroup(raw: unknown): PropGroup {
  return (PROP_GROUPS as readonly string[]).includes(raw as string)
    ? (raw as PropGroup)
    : "advanced";
}

function normalizeDescriptor(raw: unknown): PropDescriptor | null {
  const entry = asRecord(raw);
  const name = entry?.name;
  if (!entry || typeof name !== "string" || name === "") return null;

  const enumValues = Array.isArray(entry.enumValues)
    ? entry.enumValues.filter((v): v is string => typeof v === "string")
    : undefined;
  const type = normalizeType(entry.type, enumValues);
  const def = entry.default;

  return {
    name,
    type,
    editor: normalizeEditor(entry.editor, type),
    group: normalizeGroup(entry.group),
    required: entry.required === true,
    ...(typeof entry.label === "string" ? { label: entry.label } : {}),
    ...(typeof entry.description === "string" ? { description: entry.description } : {}),
    ...(typeof def === "string" || typeof def === "number" || typeof def === "boolean"
      ? { default: def }
      : {}),
    ...(enumValues && enumValues.length > 0 ? { enumValues } : {}),
    // Strictly `=== true`: the manifest never writes `content: false`, and a
    // truthy junk value from a foreign manifest must not become a flag.
    ...(entry.content === true ? { content: true } : {}),
  };
}

/**
 * Descriptors for one component type.
 *
 * `null` means "this manifest says nothing about that type" — the caller
 * keeps its own fallback (the raw JSON textarea). An empty array is a
 * different answer: the component IS in the kit and simply has no authorable
 * props of its own (the 46 compound parts), so the panel says so instead of
 * offering a JSON dump.
 */
export function descriptorsForType(
  manifest: SaunaPropsManifest | undefined,
  type: string
): readonly PropDescriptor[] | null {
  if (!manifest || !isPropsManifest(manifest)) return null;
  const entry = asRecord(manifest.components[type]);
  if (!entry) return null;
  const props = Array.isArray(entry.props) ? entry.props : [];
  return props
    .map(normalizeDescriptor)
    .filter((d): d is PropDescriptor => d !== null);
}

/**
 * Content fields of one component type — the subset the content panel
 * (SDL-366) offers the product owner. Selection is the manifest's
 * `content: true` flag (SDL-365), authored in the kit's overlay:
 * deterministic, not a name heuristic in the app.
 *
 * Unlike `descriptorsForType` there is no `null` here: the content panel has
 * no fallback form to offer, so "type unknown to this manifest" and "type
 * known but nothing marked" both come back as an empty list — no content to
 * edit either way.
 */
export function contentDescriptorsForType(
  manifest: SaunaPropsManifest | undefined,
  type: string
): readonly PropDescriptor[] {
  const descriptors = descriptorsForType(manifest, type);
  return descriptors ? descriptors.filter((d) => d.content === true) : [];
}

function unknownDescriptor(name: string, value: unknown): PropDescriptor {
  const type: PropValueType =
    typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string";
  const editable = typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  return {
    name,
    type,
    // Objects and arrays keep the JSON textarea: `text` would stringify
    // them into an input and lose the value on the first edit.
    editor: editable ? editorForType(type) : "text",
    group: "advanced",
    required: false,
    unknown: true,
  };
}

/** True for values the built-in text/number/switch editors can round-trip. */
export function isPrimitiveValue(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/**
 * Appends a descriptor for every prop the node carries that the manifest
 * does not describe. Decision 2 of the EP-48 props analysis: a prop that
 * vanished from the kit is surfaced, never removed behind the author's back.
 */
export function withUnknownProps(
  descriptors: readonly PropDescriptor[],
  props: Record<string, unknown>
): readonly PropDescriptor[] {
  const described = new Set(descriptors.map((d) => d.name));
  const extras = Object.keys(props)
    .filter((name) => !described.has(name))
    .sort()
    .map((name) => unknownDescriptor(name, props[name]));
  return extras.length > 0 ? [...descriptors, ...extras] : descriptors;
}

export type PropDescriptorGroup = {
  group: PropGroup;
  label: string;
  items: readonly PropDescriptor[];
};

/**
 * Buckets descriptors into the canonical group order, preserving the
 * manifest's order inside each bucket (that is where the overlay's `order`
 * already landed). Empty groups are dropped — the panel shows no empty
 * headings.
 */
export function groupDescriptors(
  descriptors: readonly PropDescriptor[]
): readonly PropDescriptorGroup[] {
  return PROP_GROUPS.map((group) => ({
    group,
    label: PROP_GROUP_LABELS[group],
    items: descriptors.filter((d) => d.group === group),
  })).filter((bucket) => bucket.items.length > 0);
}
