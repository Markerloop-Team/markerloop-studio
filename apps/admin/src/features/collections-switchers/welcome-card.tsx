"use client";

// «Create your first workspace» — the card itself (SDL-759). Rendered by
// /welcome (centered, no rail) and, since the re-open of 16 Oct 2026, by the
// dashboard in place of its content when the account has no workspace: one
// form, one copy, both places.
//
// Create → the new workspace becomes current (?ws=) in Collections.
// Skip   → Collections without a workspace: every workspace section shows the
//          one empty state with «Create workspace» (NoWorkspaceState).
//
// Layout follows the home canvas (/design-system/home): a card, no
// Personal/Team label — that distinction is gone.

import { useRouter } from "next/navigation";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { useAuthStore } from "@/shared/store/auth-store";

import { WS_PARAM } from "./use-collections-scope";
import { AFTER_WELCOME, markWelcomeSkipped } from "./welcome";
import { WorkspaceCreateForm } from "./workspace-create-form";

type WelcomeCardProps = {
  /** Focus the name field on mount (true on /welcome, where it is the page). */
  autoFocus?: boolean;
  "data-testid"?: string;
};

export function WelcomeCard({ autoFocus = false, "data-testid": testId }: WelcomeCardProps) {
  const t = useTranslations("welcome");
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);

  return (
    <UI.Card fullWidth maxWidth={520} data-testid={testId}>
      <UI.Card.Content>
        <UI.Box gap={6}>
          <UI.Box gap={1}>
            <UI.Text as="h1" size="2xl" weight="bold">
              {t("title")}
            </UI.Text>
            <UI.Text variant="muted" size="sm">
              {t("description")}
            </UI.Text>
          </UI.Box>
          <WorkspaceCreateForm
            autoFocus={autoFocus}
            testIdPrefix="welcome"
            onCreated={(workspace) => {
              router.replace(`${AFTER_WELCOME}?${WS_PARAM}=${workspace.id}`);
            }}
            renderActions={({ pending, canSubmit }) => (
              <UI.Box gap={3}>
                <UI.Box direction="row" gap={2} justify="end" wrap>
                  <UI.Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      markWelcomeSkipped(userId);
                      router.replace(AFTER_WELCOME);
                    }}
                    data-testid="welcome-skip"
                  >
                    {t("skip")}
                  </UI.Button>
                  <UI.Button
                    type="submit"
                    disabled={!canSubmit}
                    data-testid="welcome-create"
                  >
                    {pending ? t("creating") : t("create")}
                  </UI.Button>
                </UI.Box>
                <UI.Text variant="muted" size="sm">
                  {t("invites")}
                </UI.Text>
              </UI.Box>
            )}
          />
        </UI.Box>
      </UI.Card.Content>
    </UI.Card>
  );
}
