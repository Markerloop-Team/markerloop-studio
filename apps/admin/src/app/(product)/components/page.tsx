"use client";

// /components — the workspace's Components (EP-157, owner 29 Oct 2026): their
// own section of the Site group, no longer the Blocks tab of /pages
// (SDL-721). Since EP-175 (layer 6) the section is tiles with live previews
// by group — widgets/pages/blocks-tab.tsx. /pages?tab=blocks redirects here
// (next.config.ts).

import * as React from "react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { ListPage } from "@/shared/components/list-page";
import { NoWorkspaceState, useCollectionsScope } from "@/features/collections-switchers";
import { selectionFileScope } from "@/features/pages-media";
import { BlocksTab } from "@/widgets/pages/blocks-tab";

export const dynamic = "force-dynamic";

export default function ComponentsPage() {
  const t = useTranslations("pages");
  const tNav = useTranslations("navigation");
  const scope = useCollectionsScope();
  const { workspacesQuery, selectedWorkspace } = scope;
  const wsId = selectedWorkspace?.id ?? null;
  const fileScope = React.useMemo(() => selectionFileScope({ selectedWorkspace }), [selectedWorkspace]);
  const title = tNav("components") as string;

  // The section (header, tabs, tiles) is drawn by BlocksTab once there is a
  // workspace: its header carries the create actions, which need its state.
  if (wsId && !workspacesQuery.isLoading) {
    return <BlocksTab key={wsId} workspaceId={wsId} fileScope={fileScope} title={title} />;
  }
  return (
    <UI.Box direction="column" data-testid="components-section">
      <ListPage title={title} description={t("blocks.intro")}>
        {workspacesQuery.isLoading ? (
          <UI.Card fullWidth data-testid="components-loading">
            <UI.Card.Content>
              <UI.Skeleton height={36} />
            </UI.Card.Content>
          </UI.Card>
        ) : (
          <NoWorkspaceState />
        )}
      </ListPage>
    </UI.Box>
  );
}
