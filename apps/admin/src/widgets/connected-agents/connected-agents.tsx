"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/shared/hooks";
import { isGatewayRouteMissing } from "@/shared/lib/api/client";
import { oauthGrantsApi, type OAuthGrant } from "@/shared/lib/api/oauth-client";
import { useWorkspaces } from "@/entities/collections/workspace";
import {
  ConnectedAgentsView,
  type ConnectedAgentRow,
  type ConnectedAgentsState,
} from "./connected-agents-view";

export const connectedAgentsKeys = {
  list: () => ["oauth", "grants"] as const,
};

export function formatAgentDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Almaty",
  }).format(d);
}

/** Grants → rows: workspace by name (id when the person left it), newest use first. */
export function connectedAgentRows(
  grants: readonly OAuthGrant[],
  workspaceNames: ReadonlyMap<string, string>,
  locale: string
): ConnectedAgentRow[] {
  const used = (g: OAuthGrant) => Date.parse(g.last_used_at ?? g.created_at) || 0;
  return [...grants]
    .sort((a, b) => used(b) - used(a))
    .map((g) => ({
      grantId: g.grant_id,
      clientName: g.client_name?.trim() || g.client_id,
      workspaceName: workspaceNames.get(g.workspace_id) ?? g.workspace_id,
      lastUsed: formatAgentDate(g.last_used_at, locale),
      connected: formatAgentDate(g.created_at, locale) ?? "—",
    }));
}

export function ConnectedAgents() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const [revokeFailed, setRevokeFailed] = useState<string | null>(null);
  const [revokedName, setRevokedName] = useState<string | null>(null);

  const grantsQuery = useQuery({
    queryKey: connectedAgentsKeys.list(),
    queryFn: () => oauthGrantsApi.list(),
    retry: false,
  });
  const workspacesQuery = useWorkspaces();

  const names = useMemo(
    () => new Map((workspacesQuery.data ?? []).map((w) => [w.id, w.name])),
    [workspacesQuery.data]
  );

  const revoke = useMutation({
    mutationFn: (grantId: string) => oauthGrantsApi.revoke(grantId),
    onMutate: () => {
      setRevokeFailed(null);
      setRevokedName(null);
    },
    onSuccess: (_void, grantId) => {
      const gone = grantsQuery.data?.find((g) => g.grant_id === grantId);
      setRevokedName(gone ? gone.client_name?.trim() || gone.client_id : null);
      qc.setQueryData<OAuthGrant[]>(connectedAgentsKeys.list(), (prev) =>
        (prev ?? []).filter((g) => g.grant_id !== grantId)
      );
      void qc.invalidateQueries({ queryKey: connectedAgentsKeys.list() });
    },
    onError: (error: unknown, grantId) => {
      // Already gone (revoked elsewhere, expired): the row goes, nothing failed.
      if ((error as { status?: unknown })?.status === 404 && !isGatewayRouteMissing(error)) {
        void qc.invalidateQueries({ queryKey: connectedAgentsKeys.list() });
        return;
      }
      setRevokeFailed(grantId);
    },
  });

  const state: ConnectedAgentsState = (() => {
    if (grantsQuery.isError) {
      return isGatewayRouteMissing(grantsQuery.error) ? { kind: "unavailable" } : { kind: "failed" };
    }
    if (!grantsQuery.data) return { kind: "loading" };
    return {
      kind: "list",
      rows: connectedAgentRows(grantsQuery.data, names, locale),
      revoking: revoke.isPending ? (revoke.variables ?? null) : null,
      revokeFailed,
      revokedName,
    };
  })();

  return (
    <ConnectedAgentsView
      state={state}
      onRevoke={(grantId) => revoke.mutate(grantId)}
      onRetry={() => void grantsQuery.refetch()}
    />
  );
}
