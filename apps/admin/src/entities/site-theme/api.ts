import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/shared/lib/api/client";

import type { SiteTheme } from "./model";
import type { SiteThemeDraft } from "./errors";

export type { SiteThemeDraft, ThemeFieldError } from "./errors";

/**
 * The site theme plane of pages-service (SDL-772) through the gateway
 * (`pages:theme:*`, scoped by workspace, `workspace_id` in the QUERY on every
 * call — POSTs included, the routes carry no ScopeInBody). A pages call: it
 * travels with this tab's workspace token for that workspace (SDL-613 S6b).
 */

/** `models.SiteThemeRevision`. */
export type SiteThemeRevision = {
  revision: number;
  theme: SiteTheme;
  note: string;
  author_id?: string | null;
  created_at: string;
  current: boolean;
};

export type SiteThemeRevisionList = {
  items: SiteThemeRevision[];
  total: number;
  limit: number;
  offset: number;
};

/** The PATCH body: the whole theme (each field optional to the service) + the lock token. */
export type SiteThemePatch = Partial<SiteTheme> & { version?: number };

function scoped(path: string, workspaceId: string): string {
  return `${path}?workspace_id=${encodeURIComponent(workspaceId)}`;
}

export const siteThemeApi = {
  getDraft: (workspaceId: string): Promise<SiteThemeDraft> =>
    apiClient.get<SiteThemeDraft>(scoped("/v1/pages/theme", workspaceId), { workspaceId }),
  /** 422 invalid_theme (every field error at once), 409 theme_version_conflict (the current draft in data). */
  patchDraft: (workspaceId: string, patch: SiteThemePatch): Promise<SiteThemeDraft> =>
    apiClient.patch<SiteThemeDraft>(scoped("/v1/pages/theme", workspaceId), patch, { workspaceId }),
  /** The saved draft becomes a new revision and the site's theme. 422 invalid_theme. */
  publish: (workspaceId: string): Promise<SiteThemeRevision> =>
    apiClient.post<SiteThemeRevision>(scoped("/v1/pages/theme/publish", workspaceId), {}, { workspaceId }),
  listRevisions: (workspaceId: string): Promise<SiteThemeRevisionList> =>
    apiClient.get<SiteThemeRevisionList>(
      `${scoped("/v1/pages/theme/revisions", workspaceId)}&limit=50`,
      { workspaceId }
    ),
  /** The revision goes into the DRAFT; the site keeps its live revision until a publish. */
  restore: (workspaceId: string, revision: number): Promise<SiteThemeDraft> =>
    apiClient.post<SiteThemeDraft>(
      scoped(`/v1/pages/theme/revisions/${revision}/restore`, workspaceId),
      {},
      { workspaceId }
    ),
};

export const siteThemeKeys = {
  all: ["site-theme"] as const,
  draft: (workspaceId: string) => ["site-theme", "draft", workspaceId] as const,
  revisions: (workspaceId: string) => ["site-theme", "revisions", workspaceId] as const,
};

/** `staleTime: 0`: another member may publish meanwhile; the tab re-reads on mount. */
export function useSiteThemeDraft(workspaceId: string | null) {
  return useQuery({
    queryKey: siteThemeKeys.draft(workspaceId ?? ""),
    queryFn: () => siteThemeApi.getDraft(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useSiteThemeRevisions(workspaceId: string | null) {
  return useQuery({
    queryKey: siteThemeKeys.revisions(workspaceId ?? ""),
    queryFn: () => siteThemeApi.listRevisions(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 0,
    retry: false,
  });
}
