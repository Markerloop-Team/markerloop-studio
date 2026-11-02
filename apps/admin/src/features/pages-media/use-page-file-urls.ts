"use client";

// The canvas side of `mlfile:<uuid>` (SDL-624 §6.3): every file the page
// references is resolved to a URL the browser can load, and the engine gets
// it through `context.file`. A signed URL lives 15 minutes; the query keeps a
// 5-minute freshness and refetches every 10 so an open editor never shows a
// picture whose signature has expired.

import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { collectFileRefs, type SaunaBlockMap, type SaunaSchema } from "@markerloop/engine";

import { fileUrlQuery, useFilesDeliveryBase, type FileScope } from "@/entities/files";

export type FileResolver = (id: string) => { url: string } | undefined;

/**
 * Every file the canvas draws: the page's own and those inside the Components
 * its `Ref` nodes point at (SDL-719) — a logo in a Component is a file of the
 * Component's schema, not of the page's.
 */
export function collectCanvasFileRefs(schema: SaunaSchema, blocks?: SaunaBlockMap): string[] {
  const ids = new Set(collectFileRefs(schema));
  for (const block of Object.values(blocks ?? {})) {
    for (const id of collectFileRefs(block)) ids.add(id);
  }
  return [...ids];
}

export function usePageFileUrls(schema: SaunaSchema, scope: FileScope | null, blocks?: SaunaBlockMap): FileResolver {
  const deliveryBase = useFilesDeliveryBase();
  const ids = React.useMemo(() => collectCanvasFileRefs(schema, blocks), [schema, blocks]);
  const results = useQueries({
    queries: ids.map((id) => ({
      // Already absolute: the shared query resolves /files/<id> against the
      // delivery host (entities/files fileUrlQuery).
      ...fileUrlQuery(id, scope, deliveryBase),
      enabled: !!scope,
      staleTime: 5 * 60 * 1000,
      refetchInterval: 10 * 60 * 1000,
      retry: 1,
    })),
  });
  const urls = results.map((r) => r.data?.url);
  const key = urls.join("\n");
  return React.useMemo<FileResolver>(() => {
    const map = new Map<string, string>();
    ids.forEach((id, i) => {
      const url = urls[i];
      if (url) map.set(id, url);
    });
    return (id) => {
      const url = map.get(id);
      return url ? { url } : undefined;
    };
    // `key` stands for `urls`: a new array every render, same content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, key]);
}
