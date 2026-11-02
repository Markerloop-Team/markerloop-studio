"use client";

// The block catalog of the pages editor (SDL-605): the kit, with the
// engine's four primitives and two local layout blocks laid over it.
//
// Lives in the package since SDL-678 (was `apps/admin/src/widgets/pages/
// catalog.tsx`): the admin's editor and the workspace-site renderer (SDL-685)
// must index into ONE built registry, or a published page renders with a
// different set of names than the one it was authored against. No `@/`
// imports here — the host's only say is which component draws `DataView`
// (`createPagesElementSet({ dataView })`).
//
//   - `Page`, `Section` have no counterpart in the kit at all, and every
//     document the section creates is rooted at `Page` (entities/pages
//     seedPageSchema);
//   - `Text`, `Image`, `Box`, `Link` are the engine's primitives (SDL-630,
//     `PRIMITIVE_BLOCKS` / `PRIMITIVE_REGISTRY`). They shadow the kit's
//     components of the same names: `Text` takes `level` + `text`, which is
//     what the seed writes, and none of the four starts with an address of
//     this app in its defaults.
//
// "use client" on purpose (TRAPS T-018): `createSaunaCatalog` walks the kit's
// exports, and from a server module those are opaque client references.
//
// Primitives spread the props they do not consume onto their ROOT element:
// the renderer marks nodes with `data-sauna-node-id` through props in
// editable mode, and a primitive that swallowed it could not be selected on
// the canvas. Their look is inline style over the kit's tokens, not admin
// utility classes: the canvas frame drops the admin's sheet
// (`--sauna-sheet-role: "admin"`), so only the kit's styles resolve there.

import * as React from "react";
import { z } from "zod";
import * as UI from "@markerloop/ui/ui";
import {
  COMPOUND_BLOCKS,
  COMPOUND_ELEMENTS,
  DataViewBlock,
  PRIMITIVE_BLOCKS,
  RefBlock,
  defineBlock,
  themeColorProp,
  themeColorVar,
  type BlockDefinition,
  type ThemeColorKey,
} from "@markerloop/engine";
import {
  PRIMITIVE_REGISTRY,
  createCompoundRegistry,
  createSaunaCatalog,
  defineElementSet,
  type SaunaRegistry,
} from "@markerloop/engine/react";
import { DataView as EngineDataView, type DataViewComponentProps } from "@markerloop/engine/react";
import { isPropsManifest, type SaunaPropsManifest } from "../properties/descriptors";
import { blocksFromCatalog, mergeBlockCatalogs } from "../properties/kit-blocks";
import kitPropsManifest from "@markerloop/ui/props-manifest.json";
import { KIT_ADAPTER } from "./kit-adapter";

type PassThrough = Omit<React.HTMLAttributes<HTMLElement>, "color">;
type Children = { children?: React.ReactNode };

/**
 * The document root. It holds the page to the viewport's width (SDL-769): no
 * node inside may make the document scroll sideways, on the canvas or on the
 * published site. `overflow-x: clip`, not `hidden` — `hidden` would make the
 * root a scroll container and every `position: sticky` inside it would stick
 * to the root instead of the viewport. `min-width: 0` keeps it from being
 * stretched by its content when a host lays it out as a flex or grid item.
 */
export function Page({ children, style, ...rest }: Children & PassThrough): React.ReactElement {
  return (
    <div
      data-pages-primitive="page"
      style={{ minHeight: "100%", maxWidth: "100%", minWidth: 0, overflowX: "clip", ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

const SECTION_PADDING = { sm: "16px", md: "32px", lg: "64px" } as const;

/**
 * Section.background (SDL-775, EP-160) — the canvas's four, same values in
 * pages-service's catalog — or the key of a custom colour of the site theme
 * (SDL-950, pages-service `colorEnum`): the band paints
 * `var(--pages-color-<key>)`, and a key the theme does not have leaves the
 * band unfilled, as `default`.
 */
export const SECTION_BACKGROUNDS = ["default", "muted", "primary", "dark"] as const;
export type SectionBackground = (typeof SECTION_BACKGROUNDS)[number] | ThemeColorKey;
/** Section.width (SDL-775): how wide the content runs; absent = the band's whole width, as before. */
export const SECTION_WIDTHS = ["narrow", "default", "wide", "full"] as const;
export type SectionWidth = (typeof SECTION_WIDTHS)[number];
/** Content cap per width, after the canvas (/design-system/site-theme/inspector). `full` = no cap, no side padding. */
const SECTION_MAX_WIDTH: Record<SectionWidth, string | undefined> = {
  narrow: "560px",
  default: "760px",
  wide: "1040px",
  full: undefined,
};

export type SectionProps = Children &
  PassThrough & {
    /**
     * `dark` (SDL-773) switches the band's subtree to the theme's dark set:
     * the kit's `.dark` class (so `dark:` variants of kit components follow)
     * plus the band painted with the dark background and text. `primary`
     * (SDL-775) paints the band with the primary colour and swaps the pair
     * inside it, so text and a primary button stay readable.
     */
    background?: SectionBackground;
    align?: "left" | "center";
    padding?: keyof typeof SECTION_PADDING;
    width?: SectionWidth;
  };

export function Section({
  children,
  background = "default",
  align = "left",
  padding = "md",
  width,
  style,
  ...rest
}: SectionProps): React.ReactElement {
  const dark = background === "dark";
  const primary = background === "primary";
  // No fallback: a missing variable makes `background` invalid at computed
  // time, i.e. its initial value — transparent, the `default` band.
  const custom = (SECTION_BACKGROUNDS as readonly string[]).includes(background) ? undefined : themeColorVar(background);
  const knownWidth = width !== undefined && Object.prototype.hasOwnProperty.call(SECTION_MAX_WIDTH, width);
  // The inner column exists only for a value that needs it, so a band
  // without `width` / `primary` keeps its markup exactly as before.
  const inner = knownWidth || primary;
  return (
    <section
      data-background={background}
      data-align={align}
      data-padding={padding}
      {...(knownWidth ? { "data-width": width } : null)}
      {...(dark ? { className: "dark" } : null)}
      style={{
        // Density (SDL-773): the site theme's `--pages-density` scales the
        // band's vertical padding; no theme → 1, the padding as before.
        paddingBlock: `calc(${SECTION_PADDING[padding] ?? SECTION_PADDING.md} * var(--pages-density, 1))`,
        paddingInline: width === "full" ? "0px" : "24px",
        textAlign: align,
        background:
          background === "muted"
            ? "var(--muted)"
            : dark
              ? "var(--background)"
              : primary
                ? "var(--primary)"
                : custom,
        ...(dark ? { color: "var(--foreground)" } : null),
        // The pair is read HERE, under its own names, and swapped one level
        // down: `--primary: var(--primary-foreground)` on the same element
        // would be a cycle and both would turn invalid.
        ...(primary
          ? ({
              color: "var(--primary-foreground)",
              "--pages-band-fill": "var(--primary)",
              "--pages-band-ink": "var(--primary-foreground)",
            } as React.CSSProperties)
          : null),
        ...style,
      }}
      {...rest}
    >
      {inner ? (
        <div
          data-pages-section-content=""
          style={{
            ...(knownWidth && width ? { maxWidth: SECTION_MAX_WIDTH[width], marginInline: "auto" } : null),
            ...(primary
              ? ({
                  "--foreground": "var(--pages-band-ink)",
                  "--muted-foreground": "var(--pages-band-ink)",
                  "--primary": "var(--pages-band-ink)",
                  "--primary-foreground": "var(--pages-band-fill)",
                  "--ring": "var(--pages-band-ink)",
                } as React.CSSProperties)
              : null),
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export const PageBlock = defineBlock({
  type: "Page",
  displayName: "Page",
  staticProps: z.object({}).optional(),
  meta: {
    category: "Layout",
    description: "The document root: everything on the page lives inside it.",
    initialProps: {},
  },
});

export const SectionBlock = defineBlock({
  type: "Section",
  displayName: "Section",
  staticProps: z.object({
    background: themeColorProp(SECTION_BACKGROUNDS).default("default"),
    align: z.enum(["left", "center"]).default("left"),
    padding: z.enum(["sm", "md", "lg"]).default("md"),
    width: z.enum(SECTION_WIDTHS).optional(),
  }),
  meta: {
    category: "Layout",
    description: "A band of the page: background, alignment and vertical padding.",
    initialProps: { background: "default", align: "left", padding: "md" },
  },
});

// The kit's group of each Component comes from the adapter (SDL-629), not
// from its export name.
export const KIT = createSaunaCatalog(UI as unknown as Record<string, unknown>, { adapter: KIT_ADAPTER });

// The kit's props manifest (SDL-632): one descriptor per authorable prop of
// every kit Component. Two consumers, and both must get it: `blocksFromCatalog`
// marks the derived blocks `propsForm: "manifest"`, and the Studio's
// properties panel reads the descriptors to draw the form. Without it every
// kit block falls through to the raw JSON field. `smoke:pages` fails when an
// insertable type resolves to that field.
function asPropsManifest(value: unknown): SaunaPropsManifest {
  if (!isPropsManifest(value)) throw new Error("@markerloop/ui/props-manifest.json is not a props manifest");
  return value;
}
export const PAGES_PROPS_MANIFEST: SaunaPropsManifest = asPropsManifest(kitPropsManifest);

// Two objects, paired (SDL-629): the registry answers "what to render with",
// the blocks "what to offer for insertion". `smoke:pages` fails on a block
// with no registry pair (`findUnrenderableTypes`).
const PARTS: SaunaRegistry = { ...KIT.registry, ...PRIMITIVE_REGISTRY };
/**
 * The compound Elements (SDL-633) — `TabsView`, `CardView`, `TableView` —
 * draw their tree from the kit's parts; one node with settings on the page.
 */
export const PAGES_COMPOUND_REGISTRY: SaunaRegistry = createCompoundRegistry(COMPOUND_ELEMENTS, PARTS);
export const PAGES_COMPOUND_PARTS: SaunaRegistry = PARTS;

/**
 * Kit roots a compound Element replaces in the Insert modal (SDL-633). Kept
 * as blocks — a stored `Tabs > TabsList > …` tree keeps its nesting rule and
 * its form — but not offered: one "Tabs" tile, the one that inserts one node.
 */
export const SUPERSEDED_KIT_ROOTS: ReadonlySet<string> = new Set([...COMPOUND_ELEMENTS.map((e) => e.root), "TableKit"]);
const withheld = (b: BlockDefinition): BlockDefinition =>
  SUPERSEDED_KIT_ROOTS.has(b.type) ? { ...b, meta: { ...b.meta, insertable: false } } : b;

/** Local overrides first, then every kit component they do not shadow. */
const BLOCKS: readonly BlockDefinition[] = mergeBlockCatalogs(
  // `Ref` (SDL-718): described, never offered — `insertable: false`; the
  // renderer draws it, so it has no registry pair on purpose.
  [PageBlock, SectionBlock, ...PRIMITIVE_BLOCKS, DataViewBlock, ...COMPOUND_BLOCKS, RefBlock],
  blocksFromCatalog({ catalog: KIT.catalog, manifest: PAGES_PROPS_MANIFEST }).map(withheld)
);

function InertThemeProvider({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <>{children}</>;
}

export type PagesElementSetOptions = {
  /**
   * What draws the `DataView` Element (SDL-640) — the host's data provider
   * for the widget (SDL-678). The admin passes its live component, which
   * reads the collection's records as the signed-in person; a host that
   * passes nothing gets the engine's frame (`DataView` from
   * `@markerloop/engine/react`: tabs and an empty list, no fetching). The
   * public provider of the workspace site is a separate task.
   */
  dataView?: React.ComponentType<DataViewComponentProps>;
};

export type PagesElementSet = {
  readonly registry: SaunaRegistry;
  readonly blocks: readonly BlockDefinition[];
};

/**
 * The assembled registry + blocks. Every host builds its set HERE, so the
 * set of names is the same everywhere and only the `DataView` component
 * differs; the frozen list (`./registry-contract`) holds for any `dataView`.
 */
export function createPagesElementSet(options: PagesElementSetOptions = {}): PagesElementSet {
  const registry: SaunaRegistry = {
    ...KIT.registry,
    // SDL-681: the kit's ThemeProvider (next-themes) writes its props into an
    // inline <script> unescaped — a stored `storageKey` broke out of it. The
    // name stays (frozen); on a page it only draws its children.
    ThemeProvider: InertThemeProvider,
    Page,
    Section,
    ...PRIMITIVE_REGISTRY,
    DataView: options.dataView ?? EngineDataView,
    ...PAGES_COMPOUND_REGISTRY,
  };
  const set = defineElementSet({ registry, blocks: [...BLOCKS] });
  return { registry: set.registry, blocks: set.blocks };
}

const DEFAULT_SET = createPagesElementSet();

/** The set with the engine's `DataView` frame — what a host without a data provider renders. */
export const PAGES_BLOCKS: readonly BlockDefinition[] = DEFAULT_SET.blocks;
export const PAGES_REGISTRY: SaunaRegistry = DEFAULT_SET.registry;

/**
 * Compound parts (SDL-633) are the nodes that throw on their own: a part
 * stored before SDL-633 outside its root ("TabsList must be used within
 * Tabs", Sentry MARKERLOOP-APP-3) would take the whole page down. Each one
 * gets its own error boundary — a plate in its place. Only parts: a boundary
 * around every node would sit between an `asChild` trigger and the element
 * it clones. Moved from the admin's page editor (SDL-678) so the published
 * render isolates the same types the canvas does.
 */
const PAGES_ISOLATED_TYPES: ReadonlySet<string> = new Set([
  ...Object.keys(KIT_ADAPTER.within),
  // Roots that throw on their own when stored as they could be before
  // SDL-633: ToggleGroup with props {} ("Missing prop `type`", no
  // initialProps until a57dc14) and Tooltip without its TooltipProvider.
  // Neither is ever an asChild child.
  "ToggleGroup",
  "Tooltip",
]);
export const isPagesIsolatedType = (type: string): boolean => PAGES_ISOLATED_TYPES.has(type);
