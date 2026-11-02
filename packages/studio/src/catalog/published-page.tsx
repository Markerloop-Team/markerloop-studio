"use client";

// The published page as a visitor gets it (SDL-678): the engine renderer over
// the ONE pages registry, never editable, rendered for a guest. The client half
// of `renderPublishedPage` (`./server`): the registry is built from the kit,
// whose exports are client references on the server (TRAPS T-018), so the
// lookup has to happen in a client module — the server half only validates
// the body and hands plain data over.
//
// Per-node isolation covers the canvas's types (`isPagesIsolatedType`), and
// it has to work on the SERVER, where the page is first drawn: an error
// boundary never runs there (React's server renderer has no
// getDerivedStateFromError), so a boundary alone would let one orphaned
// `TabsList` answer the whole page with a 500. Each isolated node therefore
// sits in its own `Suspense`: when it throws during server rendering, React
// emits the fallback for that boundary only (the rest of the page streams
// as usual, the error goes to the host's `onError`) and re-renders the node
// in the browser, where `SaunaNodeErrorBoundary` catches it and draws its
// plate. Measured in the package tests (streaming render + hydration in
// jsdom) and on a production Next build (SDL-678 review).

import * as React from "react";
import type { SaunaBlockMap, SaunaSchema } from "@markerloop/engine";
import { PublicDataView, PublicDataViewProvider, SaunaNodeErrorBoundary, SaunaRenderer, type PublicDataViewSource } from "@markerloop/engine/react";
import type { SaunaNodeBoundaryProps } from "@markerloop/engine/react/renderer";
import { PAGES_BLOCKS, PAGES_REGISTRY, createPagesElementSet, isPagesIsolatedType } from "./catalog";

/**
 * The set a page with a data source renders with (SDL-679): the same names,
 * `DataView` drawn by the engine's PUBLIC provider — records an anonymous
 * visitor may see, never read with a token.
 */
const PUBLIC_DATA_SET = createPagesElementSet({ dataView: PublicDataView });

/** The attribute on the server's stand-in for a node that threw there; value = the node's type. */
export const PUBLISHED_DEFERRED_ATTR = "data-pages-published-deferred";

/**
 * Server-safe isolation of one node: the server's error lands in the
 * `Suspense` fallback, the browser's in the error boundary's plate.
 */
export function PublishedNodeBoundary(props: SaunaNodeBoundaryProps): React.ReactElement {
  return (
    <React.Suspense fallback={<div {...{ [PUBLISHED_DEFERRED_ATTR]: props.nodeType }} />}>
      <SaunaNodeErrorBoundary {...props} />
    </React.Suspense>
  );
}

/** File id (the uuid of an `mlfile:<uuid>` reference) → its public URL. */
export type PublishedPageFiles = Readonly<Record<string, string>>;

/** The DataViews' first pages and the origin the browser re-reads from (`loadPublishedPageData`). */
export type PublishedPageData = PublicDataViewSource;

export type PublishedPageProps = {
  schema: SaunaSchema;
  files?: PublishedPageFiles;
  /** Absent → `DataView` is the engine's frame (no data source configured). */
  data?: PublishedPageData;
  /**
   * The Components the page's `Ref` nodes point at (SDL-722), block id →
   * schema, already validated by the server half. Absent or without the id →
   * the engine's placeholder for that Ref.
   */
  blocks?: SaunaBlockMap;
};

/**
 * `blocks` re-keyed into a null-prototype map, or `undefined` when it holds
 * no Component. The engine looks a Ref up as `blocks[blockId]`; on a plain
 * object a blockId "constructor", "toString" or "__proto__" finds
 * `Object.prototype`'s member, the renderer takes that function for a
 * schema and the whole page answers 500 instead of the "missing"
 * placeholder (SDL-722 review). It is done HERE, not on the server: the map
 * arrives through React's serializer, which only carries plain objects, so
 * whatever the server built is a plain object again on this side.
 */
function ownBlockMap(blocks: SaunaBlockMap | undefined): SaunaBlockMap | undefined {
  if (blocks === null || typeof blocks !== "object") return undefined;
  const own: Record<string, SaunaSchema> = Object.create(null);
  let count = 0;
  for (const [id, block] of Object.entries(blocks)) {
    own[id] = block;
    count++;
  }
  return count > 0 ? own : undefined;
}

export function PublishedPage({ schema, files, data, blocks }: PublishedPageProps): React.ReactElement {
  const lookup = React.useMemo(() => ownBlockMap(blocks), [blocks]);
  const file = React.useCallback(
    (id: string) => {
      const url = files?.[id];
      return typeof url === "string" && url !== "" ? { url } : undefined;
    },
    [files]
  );
  const page = (
    <SaunaRenderer
      schema={schema}
      blocks={lookup}
      registry={data ? PUBLIC_DATA_SET.registry : PAGES_REGISTRY}
      // A node whose props follow another version of its Element is a plate,
      // not props misread by this build's component (SDL-667).
      elements={PAGES_BLOCKS}
      context={{ file, audience: "guest" }}
      nodeBoundary={PublishedNodeBoundary}
      isolate={isPagesIsolatedType}
    />
  );
  return data ? <PublicDataViewProvider value={data}>{page}</PublicDataViewProvider> : page;
}
