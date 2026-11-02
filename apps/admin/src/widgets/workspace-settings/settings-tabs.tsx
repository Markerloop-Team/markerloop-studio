"use client";

import { withBasePath } from "@/demo/config";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { useProductFeatures } from "@/shared/config/product-features-context";
import {
  SECTION_TABS_LIST_CLASS,
  SECTION_TABS_SCROLL_CLASS,
  SECTION_TABS_TRIGGER_CLASS,
} from "@/shared/components/section-header";

/**
 * Tabs of the workspace settings — the canvas `SettingsTabs` (SDL-599).
 *
 * «Members» is live since SDL-615, «Plan» since SDL-748 (canvas
 * `/design-system/billing`, approved 13 Oct 2026), «Site theme» since
 * SDL-776 (canvas `/design-system/site-theme`) — where the pages section is
 * on (`PAGES_SECTION_ENABLED`, SDL-635): the theme lives in pages-service.
 * «General» belongs to its own task: it stays in the row, disabled, so the
 * screen keeps the canvas layout instead of growing a different one per
 * task. This is the named divergence from the canvas, recorded in the
 * SDL-615 plan §6.
 *
 * The open tab is the address (`?tab=plan`), so a link — and a reload in the
 * middle of a payment — lands on it. Written with `history.replaceState`,
 * which the App Router picks up, so no `useRouter` is needed here.
 */
export const WORKSPACE_SETTINGS_TABS = ["general", "theme", "members", "plan"] as const;
export type WorkspaceSettingsTab = (typeof WORKSPACE_SETTINGS_TABS)[number];
const LIVE_TABS: readonly WorkspaceSettingsTab[] = ["members", "plan", "theme"];

/**
 * The tab an address opens. «Site theme» is no longer a panel here (EP-187,
 * layer 5): it is the full-screen editor at /theme, and `?tab=theme` is
 * redirected there by next.config (shared/config/legacy-redirects.ts). The
 * trigger stays in the row and leads to /theme; anything unknown opens
 * Members.
 */
export function workspaceSettingsTabOf(
  raw: string | null | undefined,
  _themeLive = false
): WorkspaceSettingsTab {
  if (raw === "plan") return "plan";
  return "members";
}

/** Where the «Site theme» trigger leads (EP-187): the editor, workspace kept. */
export function siteThemeHref(workspaceId: string | null | undefined): string {
  return workspaceId ? `/theme?ws=${encodeURIComponent(workspaceId)}` : "/theme";
}

export function WorkspaceSettingsTabs({
  children,
}: {
  /**
   * The panel of the open tab: a render function of the tab, or — the
   * SDL-615 form — the Members panel alone.
   */
  children: React.ReactNode | ((tab: WorkspaceSettingsTab) => React.ReactNode);
}) {
  const t = useTranslations("workspaceSettings");
  const searchParams = useSearchParams();
  const themeLive = useProductFeatures().pages;
  const fromUrl = workspaceSettingsTabOf(searchParams?.get("tab"), themeLive);
  const [tab, setTab] = React.useState<WorkspaceSettingsTab>(fromUrl);
  React.useEffect(() => setTab(fromUrl), [fromUrl]);

  const select = (next: string) => {
    if (next === "theme") {
      // A full load, not the router: the tabs are also drawn by the design
      // canvases and smokes, where no app router is mounted.
      window.location.assign(withBasePath(siteThemeHref(searchParams?.get("ws"))));
      return;
    }
    const value = workspaceSettingsTabOf(next, themeLive);
    setTab(value);
    const url = new URL(window.location.href);
    if (value === "members") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.replaceState(window.history.state, "", url.toString());
  };

  const panel =
    typeof children === "function" ? children(tab) : tab === "members" ? children : null;

  return (
    <UI.Tabs value={tab} onValueChange={select} data-testid="workspace-tabs">
      {/* The canvas's line tabs (EP-157, shared/components/section-header.tsx). */}
      <div className={SECTION_TABS_SCROLL_CLASS}>
      <UI.TabsList variant="line" className={SECTION_TABS_LIST_CLASS}>
        {WORKSPACE_SETTINGS_TABS.map((key) => {
          const live = LIVE_TABS.includes(key) && (key !== "theme" || themeLive);
          return (
            <UI.TabsTrigger
              key={key}
              value={key}
              disabled={!live}
              title={live ? undefined : t("tabs.later")}
              data-testid={`tab-${key}`}
              className={SECTION_TABS_TRIGGER_CLASS}
            >
              {t(`tabs.${key}`)}
            </UI.TabsTrigger>
          );
        })}
      </UI.TabsList>
      </div>
      <UI.TabsContent value={tab} className="pt-5">
        {panel}
      </UI.TabsContent>
    </UI.Tabs>
  );
}
