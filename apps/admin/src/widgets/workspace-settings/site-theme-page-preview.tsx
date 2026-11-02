"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { fileScope } from "@/entities/files";
import { pagesKeys, usePageOfRoute, type PagesRoute } from "@/entities/pages";
import type { SiteTheme } from "@/entities/site-theme";
import { readEditorPage } from "@/widgets/pages/page-editor";
import { PageViewFrame } from "@/widgets/pages/page-view";

/**
 * The live preview of the Site theme tab on a REAL page of the workspace
 * (SDL-776): the page's current draft body drawn in the editor's frame
 * (`CanvasFrame` of @markerloop/studio, SDL-773 `theme`), never editable, in
 * the theme DRAFT on screen. Loaded lazily by the tab, so the Members and
 * Plan tabs do not carry the pages engine.
 *
 * The admin does not serve the site's faces (`fontsBase={null}` in the
 * frame): the preview shows a system face of the same kind, the site the
 * chosen one.
 */
export default function SiteThemePagePreview({
  workspaceId,
  route,
  theme,
  host,
  deviceWidth,
}: {
  workspaceId: string;
  route: PagesRoute;
  theme: SiteTheme;
  host: string;
  /**
   * The editor frame's canvas (EP-187, layer 5): the page alone at this
   * device width, no card around it — the frame's header names the page.
   */
  deviceWidth?: number;
}) {
  const t = useTranslations("siteTheme.preview");
  const pageQuery = usePageOfRoute(workspaceId, route.id);
  const pageId = pageQuery.data?.id ?? null;
  const docQuery = useQuery({
    queryKey: pagesKeys.document(workspaceId, pageId ?? ""),
    queryFn: () => readEditorPage(workspaceId, pageId!),
    enabled: !!pageId,
    retry: false,
  });
  const scope = React.useMemo(() => fileScope(workspaceId), [workspaceId]);
  const title = route.title?.trim() ? route.title : route.path;

  const page = docQuery.data ? (
    <PageViewFrame
      schema={docQuery.data.schema}
      fileScope={scope}
      title={title}
      workspaceId={workspaceId}
      theme={theme}
      width={deviceWidth}
    />
  ) : pageQuery.isError || docQuery.isError || (pageQuery.isSuccess && !pageId) ? (
    <UI.Text as="p" size="sm" variant="muted" className="px-4 py-6" data-testid="theme-preview-unavailable">
      {t("unavailable")}
    </UI.Text>
  ) : (
    <UI.Skeleton height={320} />
  );

  if (deviceWidth !== undefined) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-2" data-testid="theme-preview" data-preview="page" data-device-width={deviceWidth}>
        <UI.Text as="p" size="xs" variant="muted" className="truncate text-center" data-testid="theme-preview-page-label">
          {t("page", { path: route.path })} · {host}
        </UI.Text>
        <div data-testid="theme-preview-page">{page}</div>
      </div>
    );
  }

  return (
    <UI.Card padding="none" fullWidth className="gap-0 overflow-hidden" data-testid="theme-preview" data-preview="page">
      <UI.Box direction="row" align="center" justify="between" gap={2} className="border-b border-border px-4 py-3">
        <UI.Text as="span" size="sm" weight="medium" className="truncate">
          {t("page", { path: route.path })}
        </UI.Text>
        <UI.Text as="span" size="xs" variant="muted" className="truncate">
          {host}
        </UI.Text>
      </UI.Box>
      <div className="max-h-[70dvh] overflow-y-auto" data-testid="theme-preview-page">
        {page}
      </div>
      <UI.Text as="p" size="xs" variant="muted" className="border-t border-border px-4 py-3">
        {t("pageNote")}
      </UI.Text>
    </UI.Card>
  );
}
