"use client";

// /settings/account — account settings. Three sections: the profile («Who you
// are», SDL-767: username and email from GET /v1/users/my, read-only) on top,
// then Connected agents (SDL-693), then Account deletion (SDL-743: the
// canvas's `account-danger` card, DELETE /v1/users/my). The account menu's
// «Profile» leads here (EP-157: «Account settings», its duplicate, is gone). Sign-in methods and editing
// from the canvas /design-system/account?case=settings are their own tasks.

import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { SectionHeader } from "@/shared/components/section-header";
import { AccountDanger } from "@/widgets/account-danger";
import { AccountProfile } from "@/widgets/account-profile";
import { ConnectedAgents } from "@/widgets/connected-agents";

export default function AccountSettingsPage() {
  const t = useTranslations("accountSettings");
  return (
    <UI.Box direction="column" gap={8} data-testid="account-settings">
      <SectionHeader title={t("title")} description={t("intro")} />
      <AccountProfile />
      <ConnectedAgents />
      <AccountDanger />
    </UI.Box>
  );
}
