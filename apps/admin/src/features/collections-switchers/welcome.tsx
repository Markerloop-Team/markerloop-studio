"use client";

// The way into the product for an account without a workspace (SDL-759).
//
// Owner decision 8 Oct 2026: there is no personal workspace — signing up makes
// an account, and a workspace is a project with an address the person picks.
// So nothing is created behind their back any more: an account with no
// workspace is offered /welcome (name + address). «Skip» leaves it in the
// product with one empty state in every workspace section.
//
// Re-open 16 Oct 2026 (owner acceptance on prod): the redirect used to be a
// client hook that waited for the list in the browser, so a new account saw
// the dashboard for a second or two and was then thrown onto /welcome. The
// decision moved to the server (src/proxy/layers/welcome-check.ts +
// src/shared/lib/api/welcome-server.ts): a full page load of a workspace
// section is answered with a 307 to /welcome before any HTML. Inside the
// shell nothing redirects any more — the dashboard draws the welcome card in
// place (WelcomeCard), the other sections NoWorkspaceState. «Skip» is a
// cookie per account (src/shared/lib/welcome-skip.ts) so the server sees it
// too; it lasts until the browser session ends.

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import {
  readWelcomeSkipCookie,
  skipCookieMatches,
  writeWelcomeSkipCookie,
} from "@/shared/lib/welcome-skip";

import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { WS_PARAM } from "./use-collections-scope";
import { WELCOME_PATH, isWorkspaceSection } from "@/shared/config/product-routes";

export { WELCOME_PATH, isWorkspaceSection };

/** Where «Create» and «Skip» lead: the first workspace section. */
export const AFTER_WELCOME = "/collections";

// Cookies can be blocked: the skip then lasts the page view.
const skippedInMemory = new Set<string>();

export function markWelcomeSkipped(userId: string | null): void {
  if (!userId) return;
  skippedInMemory.add(userId);
  try {
    writeWelcomeSkipCookie(userId);
  } catch {
    /* in memory only */
  }
}

export function wasWelcomeSkipped(userId: string | null): boolean {
  if (!userId) return false;
  if (skippedInMemory.has(userId)) return true;
  try {
    return skipCookieMatches(readWelcomeSkipCookie(), userId);
  } catch {
    return false;
  }
}

// The one empty state of every workspace section — Collections, Pages, Files,
// workspace Settings — for an account that is in no workspace (SDL-759): the
// person skipped /welcome, or left / lost the last one. One sentence, one
// action, and the other way in: someone else's invitation.
export function NoWorkspaceState() {
  const t = useTranslations("noWorkspace");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <UI.Card fullWidth data-testid="no-workspace-state">
      <UI.EmptyState paddingY={10}>
        <UI.Box direction="column" align="center" gap={4} textAlign="center">
          <Building2 size={40} aria-hidden="true" className="opacity-40" />
          <UI.Box direction="column" gap={1} align="center">
            <UI.Text as="h2" size="lg" weight="semibold">
              {t("title")}
            </UI.Text>
            <UI.Text variant="muted" size="sm" className="max-w-md">
              {t("description")}
            </UI.Text>
          </UI.Box>
          <UI.Button
            onClick={() => setOpen(true)}
            data-testid="no-workspace-create"
          >
            <Plus size={16} aria-hidden="true" />
            {t("create")}
          </UI.Button>
        </UI.Box>
      </UI.EmptyState>
      <CreateWorkspaceDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(workspace) => {
          // Stay in the section, now scoped to the new workspace.
          const sp = new URLSearchParams(window.location.search);
          sp.set(WS_PARAM, workspace.id);
          router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
        }}
      />
    </UI.Card>
  );
}
