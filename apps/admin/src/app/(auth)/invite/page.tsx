"use client";

import { withBasePath } from "@/demo/config";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale } from "@/shared/hooks";
import { authService } from "@/shared/lib/api/auth";
import {
  collectionsInviteRecipientApi,
  type InvitePreview,
} from "@/shared/lib/api/collections-client";
import { useAuthStore } from "@/shared/store/auth-store";
import {
  INVITE_PATH,
  consumeInviteToken,
  forgetInviteToken,
} from "@/features/invite/invite-token";
import {
  forgetsToken,
  outcomeFromError,
  outcomeFromPreview,
  workspaceLanding,
  type InviteOutcome,
} from "@/features/invite/invite-outcome";
import {
  InviteView,
  type InviteViewActions,
  type InviteViewState,
} from "@/features/invite/invite-view";

/**
 * /invite#token=… — the landing of an invitation email (SDL-615 S9).
 *
 * The token is taken out of the address on the first client frame and kept
 * in sessionStorage (invite-token.ts), so a detour through sign-in, sign-up
 * or Google brings the person back here with the invite intact. Nothing is
 * accepted behind the person's back: preview first, Join is a click.
 */
export default function InvitePage() {
  const { isInitialized, isAuthenticated } = useAuthStore();
  const { locale } = useLocale();
  // undefined — not read yet (SSR and the first render); null — no token.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lastPreview = useRef<InvitePreview | null>(null);

  // Layout effect: runs before the browser paints the first client frame,
  // so the token leaves the address as early as the page can touch it.
  useLayoutEffect(() => {
    setToken(consumeInviteToken(window));
  }, []);

  useEffect(() => {
    if (token === undefined || !isInitialized) return;
    if (token === null) {
      setOutcome({ kind: "invalid" });
      return;
    }
    if (!isAuthenticated) {
      setOutcome({ kind: "signed-out" });
      return;
    }
    let cancelled = false;
    setOutcome(null);
    collectionsInviteRecipientApi
      .preview(token)
      .then((preview) => {
        if (cancelled) return;
        lastPreview.current = preview;
        setOutcome(outcomeFromPreview(preview));
      })
      .catch((error: unknown) => {
        if (!cancelled) setOutcome(outcomeFromError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [token, isInitialized, isAuthenticated, attempt]);

  // A dead link or one's own link: nothing left to accept, drop the token.
  useEffect(() => {
    if (outcome && forgetsToken(outcome.kind)) {
      forgetInviteToken(window.sessionStorage);
    }
  }, [outcome]);

  const onJoin = useCallback(() => {
    if (!token) return;
    setJoining(true);
    setJoinFailed(false);
    collectionsInviteRecipientApi
      .accept(token)
      .then((accepted) => {
        forgetInviteToken(window.sessionStorage);
        window.location.replace(withBasePath(workspaceLanding(accepted.workspace.id)));
      })
      .catch((error: unknown) => {
        setJoining(false);
        const next = outcomeFromError(error);
        if (next.kind === "network") {
          setJoinFailed(true);
          return;
        }
        setOutcome(next);
      });
  }, [token]);

  const workspaceId = lastPreview.current?.workspace.id;
  const actions: InviteViewActions = {
    signUpHref: `/register?redirect=${encodeURIComponent(INVITE_PATH)}`,
    signInHref: `/login?redirect=${encodeURIComponent(INVITE_PATH)}`,
    homeHref: "/",
    onJoin,
    onSwitchAccount: () => {
      // The token stays parked: after the other sign-in the person is back
      // here with the same invite.
      authService
        .logout()
        .catch(() => undefined)
        .finally(() => {
          window.location.assign(withBasePath(`/login?redirect=${encodeURIComponent(INVITE_PATH)}`));
        });
    },
    onOpenWorkspace: () => {
      if (outcome?.kind === "already-member") {
        forgetInviteToken(window.sessionStorage);
        window.location.assign(withBasePath(workspaceLanding(outcome.workspaceId)));
      }
    },
    onBackToMembers: () => {
      window.location.assign(
        withBasePath(workspaceId
          ? `/settings/workspace?ws=${encodeURIComponent(workspaceId)}`
          : "/settings/workspace")
      );
    },
    onRetry: () => setAttempt((n) => n + 1),
  };

  return <InviteView state={viewState(outcome, locale, joining, joinFailed)} actions={actions} />;
}

function viewState(
  outcome: InviteOutcome | null,
  locale: string,
  joining: boolean,
  joinFailed: boolean
): InviteViewState {
  if (!outcome) return { kind: "loading" };
  if (outcome.kind === "live") {
    const { preview } = outcome;
    const expires = new Date(preview.expires_at);
    return {
      kind: "ready",
      joining,
      joinFailed,
      summary: {
        workspaceName: preview.workspace.name,
        inviter: preview.inviter_username || undefined,
        expiresOn: Number.isNaN(expires.getTime())
          ? preview.expires_at
          : expires.toLocaleDateString(locale, { day: "numeric", month: "long" }),
      },
    };
  }
  if (outcome.kind === "already-member") {
    return { kind: "already-member", workspaceName: outcome.workspaceName };
  }
  return outcome;
}
