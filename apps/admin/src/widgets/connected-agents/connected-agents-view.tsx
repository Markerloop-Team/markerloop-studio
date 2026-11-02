"use client";

import * as UI from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";
import { SettingsCard, SettingsRow } from "@/widgets/workspace-settings/settings-card";

/**
 * "Connected agents" of the account settings (SDL-693, EP-20): the MCP
 * agents the person let into a workspace through /oauth/consent, one row per
 * grant, each with Revoke. Same SettingsCard / SettingsRow as the workspace
 * settings (the owner-approved account canvas composition), no new visuals.
 *
 * Presentational: the container (connected-agents.tsx) owns the queries, so
 * `smoke:oauth-consent` renders every state without a network.
 */

export interface ConnectedAgentRow {
  grantId: string;
  clientName: string;
  workspaceName: string;
  /** Already formatted for the locale; null — never used since connecting. */
  lastUsed: string | null;
  /** Already formatted for the locale. */
  connected: string;
}

export type ConnectedAgentsState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "failed" }
  | {
      kind: "list";
      rows: ConnectedAgentRow[];
      revoking: string | null;
      revokeFailed: string | null;
      revokedName: string | null;
    };

export function ConnectedAgentsView({
  state,
  onRevoke,
  onRetry,
}: {
  state: ConnectedAgentsState;
  onRevoke: (grantId: string) => void;
  onRetry: () => void;
}) {
  const t = useTranslations("connectedAgents");

  const body = (() => {
    switch (state.kind) {
      case "loading":
        return (
          <UI.Box className="px-4 py-3" data-testid="connected-agents-loading">
            <UI.Skeleton className="h-10 w-full" />
          </UI.Box>
        );
      case "unavailable":
        return (
          <UI.Box className="px-4 py-3" data-testid="connected-agents-unavailable">
            <UI.Text as="p" size="sm" variant="muted">
              {t("unavailable")}
            </UI.Text>
          </UI.Box>
        );
      case "failed":
        return (
          <UI.Box direction="row" align="center" gap={3} wrap className="px-4 py-3" data-testid="connected-agents-failed">
            <UI.Text as="p" size="sm" variant="destructive" className="grow">
              {t("loadFailed")}
            </UI.Text>
            <UI.Button size="sm" variant="outline" onClick={onRetry}>
              {t("retry")}
            </UI.Button>
          </UI.Box>
        );
      case "list":
        if (state.rows.length === 0) {
          return (
            <UI.Box className="px-4 py-3" data-testid="connected-agents-empty">
              <UI.Text as="p" size="sm" variant="muted">
                {t("empty")}
              </UI.Text>
            </UI.Box>
          );
        }
        return state.rows.map((row) => (
          <SettingsRow
            key={row.grantId}
            testid="connected-agent"
            data={{ "data-grant-id": row.grantId }}
            title={row.clientName}
            description={
              <>
                <UI.Text as="div" size="sm" variant="muted">
                  {t("workspace", { name: row.workspaceName })}
                </UI.Text>
                <UI.Text as="div" size="sm" variant="muted" data-testid="connected-agent-last-used">
                  {row.lastUsed ? t("lastUsed", { date: row.lastUsed }) : t("neverUsed")}
                  {" · "}
                  {t("connected", { date: row.connected })}
                </UI.Text>
                {state.revokeFailed === row.grantId ? (
                  <UI.Text as="div" size="sm" variant="destructive" data-testid="connected-agent-revoke-failed">
                    {t("revokeFailed")}
                  </UI.Text>
                ) : null}
              </>
            }
            action={
              <UI.Button
                size="sm"
                variant="outline"
                disabled={state.revoking !== null}
                onClick={() => onRevoke(row.grantId)}
                data-testid="connected-agent-revoke"
              >
                {state.revoking === row.grantId ? t("revoking") : t("revoke")}
              </UI.Button>
            }
          />
        ));
    }
  })();

  const notice =
    state.kind === "list" && state.revokedName ? (
      <UI.Box className="px-4 py-3" data-testid="connected-agents-revoked">
        <UI.Text as="p" size="sm" variant="success">
          {t("revoked", { name: state.revokedName })}
        </UI.Text>
      </UI.Box>
    ) : null;

  return (
    <SettingsCard title={t("title")} description={t("description")} testid="connected-agents">
      {notice}
      {body}
    </SettingsCard>
  );
}
