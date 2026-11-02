"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/shared/store/auth-store";
import { loginHref, PRODUCT_HOME } from "@/shared/config/product-routes";
import { oauthConsentApi } from "@/shared/lib/api/oauth-client";
import { useWorkspaces } from "@/entities/collections/workspace";
import {
  ConsentView,
  consentErrorKind,
  consentRequestId,
  consentWorkspaces,
  decisionTarget,
  displayHost,
  initialWorkspace,
  isFinalConsentError,
  type ConsentErrorKind,
  type ConsentViewState,
} from "@/features/oauth-consent";

/**
 * /oauth/consent?request_id=… — where auth-service sends the browser from
 * GET /oauth/authorize (OAUTH_CONSENT_URL, SDL-692). Signed-in only: the
 * proxy sends a guest to /login with the whole address in ?redirect=
 * ("/oauth" is in PROTECTED_ROUTES); the client guard below covers a session
 * that ends while the page is open.
 */
export default function OAuthConsentPage() {
  const { isInitialized, isAuthenticated, userId } = useAuthStore();
  // undefined — address not read yet (SSR, first render).
  const [requestId, setRequestId] = useState<string | null | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [decisionError, setDecisionError] = useState<ConsentErrorKind | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    setRequestId(consentRequestId(window.location.search));
  }, []);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      window.location.replace(loginHref(window.location.pathname, window.location.search));
    }
  }, [isInitialized, isAuthenticated]);

  const ready = isInitialized && isAuthenticated && typeof requestId === "string";
  const requestQuery = useQuery({
    queryKey: ["oauth", "authorize-request", requestId],
    queryFn: () => oauthConsentApi.getRequest(requestId as string),
    enabled: ready,
    retry: false,
    staleTime: Infinity,
  });
  const workspacesQuery = useWorkspaces({ enabled: ready });

  const workspaces = useMemo(
    () => consentWorkspaces(workspacesQuery.data ?? [], userId),
    [workspacesQuery.data, userId]
  );

  useEffect(() => {
    setSelected((current) => current ?? initialWorkspace(workspaces));
  }, [workspaces]);

  const shownHost = useMemo(
    () => (requestQuery.data ? displayHost(requestQuery.data.redirect_host) : null),
    [requestQuery.data]
  );

  const decide = useCallback(
    async (kind: "approve" | "deny") => {
      if (!requestId || busy || !shownHost) return;
      if (kind === "approve" && !shownHost.ascii) return;
      if (kind === "approve" && !selected) return;
      setBusy(kind);
      setDecisionError(null);
      try {
        const decision =
          kind === "approve"
            ? await oauthConsentApi.approve(requestId, selected as string)
            : await oauthConsentApi.deny(requestId);
        // Only to the host the person saw (ASCII), only https / loopback http.
        const target = decisionTarget(decision?.redirect_to, shownHost.ascii);
        if (!target) {
          setDecisionError("redirect-mismatch");
          setBusy(null);
          return;
        }
        setRedirecting(true);
        window.location.assign(target);
      } catch (error: unknown) {
        setDecisionError(consentErrorKind(error));
        setBusy(null);
      }
    },
    [requestId, selected, busy, shownHost]
  );

  const state: ConsentViewState = (() => {
    if (requestId === null) return { kind: "missing" };
    if (redirecting && shownHost?.ascii) {
      return { kind: "redirecting", redirectHost: shownHost.ascii };
    }
    if (decisionError && isFinalConsentError(decisionError)) {
      return { kind: "final", error: decisionError as "expired" | "decided" };
    }
    if (requestQuery.isError) {
      const kind = consentErrorKind(requestQuery.error);
      if (isFinalConsentError(kind)) return { kind: "final", error: kind as "expired" | "decided" };
      return { kind: "load-failed" };
    }
    if (workspacesQuery.isError) return { kind: "load-failed" };
    if (!requestQuery.data || !workspacesQuery.data || !shownHost) return { kind: "loading" };
    const req = requestQuery.data;
    return {
      kind: "ready",
      clientName: req.client_name?.trim() || req.client_id,
      clientId: req.client_id,
      redirectHost: shownHost.ascii,
      redirectLookalike: shownHost.lookalike,
      workspaces,
      selected,
      busy,
      error: decisionError as Exclude<ConsentErrorKind, "expired" | "decided"> | null,
    };
  })();

  return (
    <ConsentView
      state={state}
      actions={{
        onSelect: setSelected,
        onApprove: () => void decide("approve"),
        onDeny: () => void decide("deny"),
        onRetry: () => {
          void requestQuery.refetch();
          void workspacesQuery.refetch();
        },
        homeHref: PRODUCT_HOME,
      }}
    />
  );
}
