"use client";

// Human names for the pages-service links in a 409 file_in_use (SDL-624
// §6.5). pages-service registers its links under the collections
// `pages:page` / `pages:block` (the colon cannot occur in a collections-service
// key, so a user collection named `pages` never collides). The live
// publication snapshot (SDL-676) registers under `pages:publication` with
// record_id = route id: it reads «Опубликованная версия страницы (/path)»,
// the path from the routes list — the link itself carries none. The routes and
// pages lists are read only when such a link is present — prod has none, and
// then pages-service is never called. No access or an error falls back to
// «Страница» + record id.

import { useRoutes, usePages } from "@/entities/pages";
import { useCollections } from "@/entities/collections/collection";
import type { FileLink } from "@/entities/files";
import type { DescribeFileLink } from "@/widgets/files";
import { useTranslations } from "@/shared/hooks";

export const PAGES_PAGE_COLLECTION = "pages:page";
export const PAGES_BLOCK_COLLECTION = "pages:block";
export const PAGES_PUBLICATION_COLLECTION = "pages:publication";

export function isPagesLink(link: Pick<FileLink, "collection">): boolean {
  return (
    link.collection === PAGES_PAGE_COLLECTION ||
    link.collection === PAGES_BLOCK_COLLECTION ||
    link.collection === PAGES_PUBLICATION_COLLECTION
  );
}

/** The node a link's JSON pointer (`/nodes/<id>/props/src`) points into. */
export function nodeOfPointer(pointer: string): string | null {
  const m = /^\/nodes\/([^/]+)\//.exec(pointer);
  return m ? m[1].replace(/~1/g, "/").replace(/~0/g, "~") : null;
}

export function usePagesLinkLabels(links: FileLink[] | null, workspaceId: string | null): DescribeFileLink {
  const t = useTranslations("files.delete");
  const wanted = !!links?.some(isPagesLink) && !!workspaceId;
  const routes = useRoutes(wanted ? workspaceId : null);
  const pages = usePages(wanted ? workspaceId : null);

  return (link) => {
    if (!isPagesLink(link)) return null;
    const node = nodeOfPointer(link.field);
    const detail = node ? t("usageNode", { id: node }) : t("usageField", { field: link.field });
    if (link.collection === PAGES_BLOCK_COLLECTION) {
      return { title: t("blockUsageUnknown"), detail: `${link.record_id} · ${detail}` };
    }
    if (link.collection === PAGES_PUBLICATION_COLLECTION) {
      const published = routes.data?.find((r) => r.id === link.record_id);
      if (!published) {
        return { title: t("publicationUsageUnknown"), detail: `${link.record_id} · ${detail}` };
      }
      return {
        title: t("publicationUsage", { path: published.path }),
        detail,
        href: `/pages/${published.id}?ws=${workspaceId}`,
      };
    }
    const page = pages.data?.find((p) => p.id === link.record_id);
    const route = page ? routes.data?.find((r) => r.id === page.route_id) : undefined;
    if (!page || !route) {
      return { title: t("pageUsageUnknown"), detail: `${link.record_id} · ${detail}` };
    }
    return {
      title: t("pageUsage", { label: page.label || route.title || route.path, path: route.path }),
      detail,
      href: `/pages/${route.id}?ws=${workspaceId}`,
    };
  };
}

/** The service's page cap: one page is every collection a workspace realistically has. */
const COLLECTIONS_PAGE = 100;

/**
 * Human names AND a way in for every link of a file (SDL-650): a page opens in
 * the editor (usePagesLinkLabels), a collection record opens in its
 * collection with the record panel (`?record=`). A collection link carries the
 * collection KEY (collections-service writes `key` into the reverse index),
 * the admin route is by id — so the workspace's collections are read to map
 * one to the other, and only when such a link is present. An unknown key
 * falls back to the default row (record id · collection · field).
 */
export function useFileLinkLabels(links: FileLink[] | null, workspaceId: string | null): DescribeFileLink {
  const t = useTranslations("files.delete");
  const pages = usePagesLinkLabels(links, workspaceId);
  const wanted = !!links?.some((l) => !isPagesLink(l)) && !!workspaceId;
  const collections = useCollections(
    wanted && workspaceId
      ? { workspace_id: workspaceId, page: 1, limit: COLLECTIONS_PAGE, sort_by: "name", sort_order: "asc" }
      : null
  );

  return (link) => {
    if (isPagesLink(link)) return pages(link);
    const collection = collections.data?.data?.find((c) => c.key === link.collection);
    if (!collection || !workspaceId) return null;
    const usp = new URLSearchParams({ ws: workspaceId, record: link.record_id });
    return {
      title: t("recordUsage", { collection: collection.name }),
      detail: `${link.record_id} · ${t("usageMeta", { collection: collection.key, field: link.field })}`,
      href: `/collections/${collection.id}?${usp.toString()}`,
    };
  };
}
