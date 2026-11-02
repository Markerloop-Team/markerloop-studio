"use client";

// /settings/workspace — workspace settings (SDL-615, EP-124).
//
// Layout is the canvas /design-system/workspace (SDL-599), cases
// members / members-team / members-sent / members-mailfail /
// members-remove / members-viewer, with the canvas testids. Only the
// Members tab is live; General and Site theme are their own tasks.
//
// The Plan tab (SDL-748, canvas /design-system/billing) is `?tab=plan`. The
// Site theme (SDL-776) left for its own full-screen editor at /theme (EP-187,
// layer 5); `?tab=theme` is redirected there.
//
// Scope: the workspace comes from ?ws= through the collections scope, the
// same one the switcher writes, so the account menu entry opens the
// settings of the workspace the person is in.

import * as React from "react";
import * as UI from "@markerloop/ui/ui";
import { SectionHeader } from "@/shared/components/section-header";

import { useTranslations } from "@/shared/hooks";
import { useAuthStore } from "@/shared/store/auth-store";
import {
  NoWorkspaceState,
  useCollectionsScope,
} from "@/features/collections-switchers";
import {
  WorkspaceMembersTab,
  WorkspacePlanTab,
  WorkspaceSettingsTabs,
} from "@/widgets/workspace-settings";

export default function WorkspaceSettingsPage() {
  const t = useTranslations("workspaceSettings");
  const userId = useAuthStore((s) => s.userId);
  const { selectedWorkspace, workspacesQuery } = useCollectionsScope();

  return (
    <UI.Box direction="column" gap={5} data-testid="workspace-settings">
      {/*
        The workspace's own name is the title (SDL-753): a kicker line was
        too quiet to tell which workspace a person is being invited to. No
        kicker at all since EP-157 — the section header has none.
      */}
      <SectionHeader
        title={selectedWorkspace ? selectedWorkspace.name : t("title")}
        description={t("intro")}
        data-testid="workspace-settings-title"
      />
      <WorkspaceSettingsTabs>
        {(tab) =>
          selectedWorkspace ? (
            tab === "plan" ? (
              <WorkspacePlanTab
                key={selectedWorkspace.id}
                workspace={selectedWorkspace}
                currentUserId={userId}
              />
            ) : (
              <WorkspaceMembersTab
                // A new workspace is a new screen: no notice, dialog or typed
                // address may leak from the previous one.
                key={selectedWorkspace.id}
                workspace={selectedWorkspace}
                currentUserId={userId}
              />
            )
          ) : workspacesQuery.isLoading ? (
            <UI.Text as="p" size="sm" variant="muted">
              {t("loading")}
            </UI.Text>
          ) : workspacesQuery.error ? (
            // A list that failed to load is not an empty one (SDL-759 review).
            <UI.Alert
              variant="destructive"
              data-testid="workspace-settings-load-error"
            >
              {t("workspacesLoadError")}
            </UI.Alert>
          ) : (
            <NoWorkspaceState />
          )
        }
      </WorkspaceSettingsTabs>
    </UI.Box>
  );
}
