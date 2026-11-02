"use client";

// /theme — the site theme editor (EP-187, layer 5, decision 4): full-screen in
// the editor frame shared with the page and the component editors
// (shared/components/editor-frame.tsx). The canvas is a real page of the site
// with Desktop / Tablet / Phone, the theme's fields are on the right, no left
// panel. It was the «Site theme» tab of the workspace settings (SDL-776); the
// old address `/settings/workspace?tab=theme` answers 308 here
// (shared/config/legacy-redirects.ts). Full-screen like the other editors
// (`EDITOR_ROUTE`, app/(product)/product-shell.tsx).
//
// A theme has no list of its own, so Back returns to where the person came
// from inside the admin; opened directly, it falls back to the workspace
// settings.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { NoWorkspaceState, useCollectionsScope } from "@/features/collections-switchers";
import { WorkspaceSiteThemeTab } from "@/widgets/workspace-settings";

export const dynamic = "force-dynamic";

/** Where Back leads when there is nowhere to go back to: the workspace settings. */
function themeBackFallback(workspaceId: string | null | undefined): string {
  return workspaceId ? `/settings/workspace?ws=${encodeURIComponent(workspaceId)}` : "/settings/workspace";
}

/** True when the previous entry of this tab is a page of the admin (not /theme itself). */
function cameFromAdmin(): boolean {
  if (typeof document === "undefined" || !document.referrer) return false;
  try {
    const from = new URL(document.referrer);
    return from.origin === window.location.origin && from.pathname !== "/theme" && window.history.length > 1;
  } catch {
    return false;
  }
}

export default function ThemeEditorRoute() {
  const t = useTranslations("siteTheme");
  const router = useRouter();
  const { selectedWorkspace, workspacesQuery } = useCollectionsScope();
  const fallback = themeBackFallback(selectedWorkspace?.id);
  const onBack = React.useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!cameFromAdmin()) return;
      e.preventDefault();
      router.back();
    },
    [router]
  );

  if (workspacesQuery.isLoading) {
    return <UI.Skeleton className="h-dvh w-full" data-testid="site-theme-loading" />;
  }
  if (!selectedWorkspace) {
    return (
      <UI.Box direction="column" gap={4} className="h-dvh p-6" data-testid="theme-editor-no-workspace">
        <UI.Button asChild variant="ghost" size="sm" className="self-start">
          <Link href={fallback}>{t("frame.back")}</Link>
        </UI.Button>
        <NoWorkspaceState />
      </UI.Box>
    );
  }
  return (
    <WorkspaceSiteThemeTab
      key={selectedWorkspace.id}
      workspace={selectedWorkspace}
      frame={{ back: { href: fallback, onClick: onBack } }}
    />
  );
}
