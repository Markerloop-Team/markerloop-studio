import rawPropsMeta from "./props-meta.json";

/**
 * Manual overlay of the props manifest (layer 3; SDL-632 S1, ported from the
 * reference's `sauna-props-meta.ts`, SDL-291/SDL-365/SDL-380).
 *
 * Layers 1–2 (`scripts/props-manifest.mjs`) extract and classify props by
 * machine; this overlay holds ONLY the point fixes where the rules miss: a
 * field caption, a group override, order, hiding — plus `children` declared as
 * a content field on text primitives and single-slot compound parts that have
 * no props of their own.
 *
 * The data lives in `props-meta.json`, not here: the generator is a plain-ESM
 * script outside `src/` that reads JSON directly. This module is the typed
 * wrapper for TS consumers. It is re-exported from `./index.ts` only — not
 * from the public `./ui` barrel; consumers read the generated
 * `@markerloop/ui/props-manifest.json` instead.
 */

export type PropsMetaGroup = "content" | "appearance" | "layout" | "state" | "advanced";

/** `children` declared as a content field, added on top of the extraction. */
export type PropsChildrenMeta = {
  editor: "text";
  group: PropsMetaGroup;
  label?: string;
};

/** A prop the extraction cannot represent, described in full. */
export type PropsDeclMeta = {
  type: "string" | "number" | "boolean" | "enum";
  editor: "segmented" | "select" | "switch" | "number" | "text" | "link";
  group: PropsMetaGroup;
  label?: string;
  enumValues?: string[];
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
};

export type ComponentPropsMeta = {
  /** Field captions: prop name → caption in the panel. */
  label?: Record<string, string>;
  /** Group override: prop name → group. */
  group?: Record<string, PropsMetaGroup>;
  /** Field order: the listed props first, the rest keep theirs. */
  order?: string[];
  /** Props the panel does not show at all. */
  hide?: string[];
  children?: PropsChildrenMeta;
  /**
   * Props the layer-1 extraction cannot represent: `React.ReactNode`
   * (`ListHeader.title`) and discriminated unions (`Box`'s layout props reach
   * docgen as `any`). Strictly ADDITIVE: declaring a prop the extraction
   * already describes fails the generator, so one field never has two
   * descriptions.
   */
  props?: Record<string, PropsDeclMeta>;
  /**
   * "Reviewed: no authorable props" — pure compound structure (`CardHeader`,
   * `TableRow`). An absent type falls through to the raw-JSON field in the
   * Studio, an empty one renders "no authorable props"; declaring this on a
   * component that HAS props fails the generator.
   */
  noProps?: true;
  /**
   * Content decisions: prop name → content or not. `true` lands in the
   * manifest as `content: true`, the flag the Studio content panel selects
   * by; `false` records "reviewed, not content" and writes nothing.
   */
  content?: Record<string, boolean>;
};

/**
 * A JSON import widens literals to `string`, hence `as` rather than
 * `satisfies`. The real guard is at runtime: the generator (and
 * `props:manifest:check`) fails on an unknown component or prop.
 */
export const propsMeta = rawPropsMeta as Record<string, ComponentPropsMeta>;
