"use client";

// The live preview on a Component's tile (EP-175, layer 6). Agreed design:
//
// - the SAME engine and the SAME frame as the editor's canvas — CanvasFrame
//   from @markerloop/studio portals PagesCanvas into a same-origin iframe, so
//   the tile shows what the site shows, never a screenshot or a re-drawing;
// - in the SITE theme (the workspace's theme draft), never the admin's dark
//   theme: the frame's document is always light and takes the theme sheet;
// - a virtual 1280px viewport scaled down to the tile; a tall Component shows
//   its top part under a soft fade; a transparent Component sits on the site
//   background (the frame's document paints it);
// - mounted only while the tile is in or near the viewport, and unmounted
//   again once it is scrolled far away (IntersectionObserver), so a long
//   list keeps only the frames around the screen alive;
// - a Component bound to a collection (a DataView, or a node with data
//   bindings — also through the Components it places) is NOT rendered: no
//   data is fetched for a tile, a grey skeleton says where the data comes from;
// - parameters render with their defaults (the renderer's own rule for a Ref
//   without values; a Component drawn alone has no values at all);
// - an empty Component shows the component icon instead;
// - the list's own `schema` is used when it carries one; when it does not
//   (a gateway or an older service that trims it), the tree is read for this
//   tile only once it comes near the viewport — the same query the canvas
//   uses for a Ref (`pagesComponentKeys.schema`);
// - a tree that cannot be read or parsed is «Preview unavailable», never the
//   empty icon: a parse failure must not look like an empty Component.

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Component as ComponentIcon, EyeOff } from "lucide-react";
import {
  migrateSaunaSchema,
  validateSaunaSchema,
  type SaunaBlockMap,
  type SaunaSchema,
} from "@markerloop/engine";
import { CanvasFrame } from "@markerloop/studio";

import type { FileScope } from "@/entities/files";
import { COMPONENT_STALE_MS, pagesComponentKeys } from "@/entities/pages";
import { PagesCanvas } from "./page-editor";

/** The virtual viewport a tile draws its Component at. */
export const PREVIEW_VIEWPORT = 1280;
/** How far outside the viewport a tile starts rendering. */
export const PREVIEW_ROOT_MARGIN = "300px 0px";
/**
 * How far outside the viewport a rendered tile is dropped again. Wider than
 * the start margin, so a tile at the edge does not flicker on and off; only
 * the tiles around the screen stay alive, however long the list is.
 */
export const PREVIEW_DROP_MARGIN = "900px 0px";

/** A stored Component tree as the renderer takes it; null — not a readable tree. */
export function readComponentSchema(raw: unknown): SaunaSchema | null {
  if (!raw || typeof raw !== "object") return null;
  const checked = validateSaunaSchema(raw, { mode: "read" });
  if (!checked.ok) return null;
  return migrateSaunaSchema(checked.value);
}

type LooseNode = { type?: unknown; props?: unknown; bind?: unknown; children?: unknown };

/** Nothing to draw: no root, or a root with neither children nor props. */
export function isEmptyComponent(schema: SaunaSchema | null): boolean {
  if (!schema) return true;
  const root = schema.nodes[schema.rootId] as LooseNode | undefined;
  if (!root) return true;
  const children = Array.isArray(root.children) ? root.children : [];
  const props = root.props && typeof root.props === "object" ? Object.keys(root.props as object) : [];
  return children.length === 0 && props.length === 0 && Object.keys(schema.nodes).length <= 1;
}

/**
 * What a Component reads from a collection: the collections its DataViews
 * point at (by id), and whether any node carries data bindings. Followed
 * through the Components it places (`blocks`), a cycle cut.
 */
export function componentDataSources(
  schema: SaunaSchema | null,
  blocks: SaunaBlockMap = {}
): { bound: boolean; collectionIds: string[] } {
  const ids = new Set<string>();
  let bound = false;
  const seen = new Set<SaunaSchema>();
  const walk = (doc: SaunaSchema | null | undefined) => {
    if (!doc || seen.has(doc)) return;
    seen.add(doc);
    for (const raw of Object.values(doc.nodes) as LooseNode[]) {
      const props = (raw.props && typeof raw.props === "object" ? raw.props : {}) as Record<string, unknown>;
      if (raw.type === "DataView") {
        bound = true;
        const source = props.source as { collection_id?: unknown } | undefined;
        if (source && typeof source.collection_id === "string") ids.add(source.collection_id);
      }
      if (raw.bind !== undefined && raw.bind !== null) bound = true;
      if (raw.type === "Ref" && typeof props.blockId === "string") walk(blocks[props.blockId.trim()]);
    }
  };
  walk(schema);
  return { bound, collectionIds: [...ids] };
}

/**
 * True while the element is within PREVIEW_ROOT_MARGIN of the viewport; goes
 * back to false once it leaves PREVIEW_DROP_MARGIN, so a tile scrolled far
 * away unmounts its frame. Two observers: the narrow one turns it on, the
 * wide one turns it off.
 */
function useNearViewport(ref: React.RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const on = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: PREVIEW_ROOT_MARGIN }
    );
    const off = new IntersectionObserver(
      (entries) => {
        if (entries.every((e) => !e.isIntersecting)) setNear(false);
      },
      { rootMargin: PREVIEW_DROP_MARGIN }
    );
    on.observe(el);
    off.observe(el);
    return () => {
      on.disconnect();
      off.disconnect();
    };
  }, [ref]);
  return near;
}

export type ComponentPreviewTexts = {
  data: (name: string) => string;
  dataUnnamed: string;
  empty: string;
  unavailable: string;
};

/**
 * Where the tile's tree comes from: the list row's `schema` when it carries
 * one (`undefined` / `null` — it did not), else `load` (one read per tile).
 */
export type ComponentPreviewSource = {
  workspaceId: string;
  blockId: string;
  raw: unknown;
  load: (blockId: string) => Promise<SaunaSchema | null>;
};

type Resolved = { state: "ready"; schema: SaunaSchema } | { state: "loading" } | { state: "unavailable" };

/** The tile's tree: parsed from the list, or read once the tile is near. */
function useResolvedSchema(source: ComponentPreviewSource, active: boolean): Resolved {
  const fromList = source.raw !== undefined && source.raw !== null;
  const parsed = React.useMemo(() => (fromList ? readComponentSchema(source.raw) : null), [fromList, source.raw]);
  const read = useQuery({
    queryKey: pagesComponentKeys.schema(source.workspaceId, source.blockId),
    queryFn: () => source.load(source.blockId),
    enabled: !fromList && active,
    staleTime: COMPONENT_STALE_MS,
    retry: false,
  });
  if (fromList) return parsed ? { state: "ready", schema: parsed } : { state: "unavailable" };
  if (read.data) {
    const again = readComponentSchema(read.data);
    return again ? { state: "ready", schema: again } : { state: "unavailable" };
  }
  if (read.isError || read.data === null) return { state: "unavailable" };
  return { state: "loading" };
}

/**
 * The media of one tile. Fixed 16:10 box; the frame inside is scaled to its
 * width, and only the top of a tall Component is shown, under a fade.
 */
export function ComponentPreview({
  source,
  blocks,
  theme,
  fileScope,
  title,
  collectionName,
  texts,
  dim = false,
  eager = false,
}: {
  source: ComponentPreviewSource;
  /** Every Component of the workspace by id — the Refs inside draw from it, no request. */
  blocks: SaunaBlockMap;
  /** The site theme (pages-service theme JSON); absent — the kit's look. */
  theme?: unknown;
  fileScope: FileScope | null;
  title: string;
  /** Resolves a collection id to its name; undefined while unknown. */
  collectionName?: (id: string) => string | undefined;
  texts: ComponentPreviewTexts;
  /** A Component on no page is drawn quieter. */
  dim?: boolean;
  /** Render at once, without waiting for the viewport (a smoke, a single tile). */
  eager?: boolean;
}) {
  const boxRef = React.useRef<HTMLSpanElement | null>(null);
  const near = useNearViewport(boxRef);
  const resolved = useResolvedSchema(source, near || eager);
  const schema = resolved.state === "ready" ? resolved.schema : null;
  const empty = resolved.state === "ready" && isEmptyComponent(schema);
  const data = React.useMemo(() => componentDataSources(schema, blocks), [schema, blocks]);

  let body: React.ReactNode;
  let state: "empty" | "data" | "live" | "waiting" | "loading" | "unavailable";
  if (resolved.state === "unavailable") {
    state = "unavailable";
    body = (
      <span className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground" data-component-preview-unavailable="">
        <EyeOff size={24} aria-hidden="true" />
        <span className="text-xs">{texts.unavailable}</span>
      </span>
    );
  } else if (resolved.state === "loading") {
    state = near || eager ? "loading" : "waiting";
    body = null;
  } else if (empty) {
    state = "empty";
    body = (
      <span className="flex size-full flex-col items-center justify-center gap-2 text-component" data-component-preview-empty="">
        <ComponentIcon size={32} aria-hidden="true" />
        <span className="sr-only">{texts.empty}</span>
      </span>
    );
  } else if (data.bound) {
    state = "data";
    const name = data.collectionIds.map((id) => collectionName?.(id)).find((n): n is string => !!n);
    body = (
      <span className="flex size-full flex-col justify-center gap-2 p-4" data-component-preview-skeleton="">
        <span className="block h-3 w-1/3 rounded bg-muted-foreground/20" />
        <span className="block h-3 w-full rounded bg-muted-foreground/15" />
        <span className="block h-3 w-5/6 rounded bg-muted-foreground/15" />
        <span className="block h-3 w-2/3 rounded bg-muted-foreground/15" />
        <span className="mt-1 block truncate text-xs text-muted-foreground" data-component-preview-caption="">
          {name ? texts.data(name) : texts.dataUnnamed}
        </span>
      </span>
    );
  } else if (near || eager) {
    state = "live";
    // A short Component sits in the middle of the media box, a tall one is
    // shown from its top (`safe center`) and cut under the fade.
    body = (
      <span className="pointer-events-none flex size-full flex-col [justify-content:safe_center]" aria-hidden="true" inert>
        <CanvasFrame width={PREVIEW_VIEWPORT} title={title} theme={theme}>
          <PagesCanvas editable={false} schema={schema!} fileScope={fileScope} screen="base" audience="guest" blocks={blocks} />
        </CanvasFrame>
      </span>
    );
  } else {
    state = "waiting";
    body = null;
  }

  return (
    <span
      ref={boxRef}
      className={`relative block aspect-[16/10] w-full overflow-hidden rounded-lg bg-muted ${dim ? "opacity-60 grayscale" : ""}`}
      data-component-preview={state}
    >
      {body}
      {state === "live" ? (
        // The soft fade over the bottom: a tall Component is cut, not squeezed.
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-muted to-transparent" />
      ) : null}
    </span>
  );
}
