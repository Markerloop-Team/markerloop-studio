"use client";

import { withBasePath } from "@/demo/config";
/**
 * «Account deletion» — the last card of the account settings (SDL-743),
 * laid out after the account canvas `/design-system/account?case=settings`
 * (card `account-danger`, row `danger-delete`). The canvas's row text about
 * team workspaces "staying" is not used: since the owner's decision of
 * 7 Oct 2026 a workspace with other members blocks the deletion (409) until
 * it is deleted, and the dialog says so with the list.
 *
 * After 204 the session is already revoked server-side (SDL-742); the sign-out
 * here expires the cookies (authService.logout) and drops the parked invite,
 * then LOADS /login. A full load, not router.replace: clearing the auth store
 * in place wakes the product shell's guard first, and the person landed on
 * /login?redirect=/settings/account — an address of an account that no longer
 * exists (measured on a production build). The load also drops every cached
 * query of the deleted account.
 */

import { useState } from "react";
import * as UI from "@markerloop/ui/ui";

import { DeleteAccountDialog } from "@/features/account-delete";
import { forgetInviteToken } from "@/features/invite/invite-token";
import { useAuth } from "@/shared/hooks/use-auth";
import { useTranslations } from "@/shared/hooks";
import { authService } from "@/shared/lib/api/auth";
import { SettingsCard, SettingsRow } from "@/widgets/workspace-settings/settings-card";

const loadPage = (href: string) => window.location.replace(withBasePath(href));

export function AccountDanger({
  request,
  navigate = loadPage,
}: {
  /** The DELETE; tests pass a stub. */
  request?: () => Promise<void>;
  /** Full page load; tests pass a spy (jsdom does not navigate). */
  navigate?: (href: string) => void;
} = {}) {
  const t = useTranslations("accountDelete");
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const signOutAfterDeletion = async () => {
    await authService.logout();
    forgetInviteToken(window.sessionStorage);
    navigate("/login");
  };

  return (
    <>
      <SettingsCard testid="account-danger" title={t("title")} description={t("description")}>
        <SettingsRow
          testid="danger-delete"
          title={t("rowTitle")}
          description={t("rowDescription")}
          action={
            <UI.Button
              type="button"
              variant="destructive"
              size="sm"
              data-testid="account-delete-open"
              onClick={() => setOpen(true)}
            >
              {t("open")}
            </UI.Button>
          }
        />
      </SettingsCard>
      <DeleteAccountDialog
        open={open}
        onOpenChange={setOpen}
        username={user?.username ?? null}
        onDeleted={signOutAfterDeletion}
        request={request}
      />
    </>
  );
}
