"use client";

import * as React from "react";
import * as UI from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";
import { usePolicyEdition } from "@/entities/policy";
import {
  downloadCsv,
  editionInForce,
  editionStatus,
  formatAcceptedAt,
  useUserPolicyAcceptances,
  type UserPolicyAcceptance,
} from "@/entities/policy-acceptance";
import { BrowserCell, ExportCsvButton, IpCell } from "./cells";

type Person = { id: string; username: string; email: string | null };

/**
 * One person's history on their card in Users (canvas `?case=user-card`):
 * every edition they accepted, newest first, with a CSV of exactly that.
 * Mount it only behind the journal permission — it reads
 * GET /v1/users/:id/policy-acceptances, which the gateway gates by it.
 */
export function UserPolicyHistory({ user }: { user: Person }) {
  const history = useUserPolicyAcceptances(user.id);
  const edition = usePolicyEdition();
  return (
    <UserPolicyHistoryView
      user={user}
      currentEdition={editionInForce(edition?.version)}
      rows={history.data?.acceptances}
      loading={history.isPending}
      error={history.isError}
      onRetry={() => void history.refetch()}
    />
  );
}

export function UserPolicyHistoryView({
  user,
  currentEdition,
  rows,
  loading,
  error,
  onRetry,
}: {
  user: Person;
  currentEdition: string | null;
  rows: UserPolicyAcceptance[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations("policyAcceptances");
  const list = rows ?? [];
  return (
    <UI.Tooltip.Provider>
      <UI.Card data-testid="user-policy-acceptances">
        <UI.Card.Header>
          <UI.Box direction="row" align="center" justify="between" gap={2} wrap>
            <UI.Box gap={1} className="min-w-0">
              <UI.Card.Title>{t("userHistoryTitle")}</UI.Card.Title>
              <UI.Card.Description>{t("userHistoryDescription")}</UI.Card.Description>
            </UI.Box>
            <ExportCsvButton
              filename={`policy-acceptances-${user.username}.csv`}
              disabled={list.length === 0}
              testid="user-acceptances-export-csv"
              onExport={async () =>
                downloadCsv(
                  `policy-acceptances-${user.username}.csv`,
                  list.map((a) => ({ ...a, email: user.email, username: user.username }))
                )
              }
            />
          </UI.Box>
        </UI.Card.Header>
        <UI.Card.Content>
          {error ? (
            <UI.Box direction="row" align="center" gap={3} wrap data-testid="user-acceptances-error">
              <UI.Text variant="muted" size="sm">
                {t("errorTitle")}
              </UI.Text>
              <UI.Button size="sm" variant="outline" onClick={onRetry}>
                {t("retry")}
              </UI.Button>
            </UI.Box>
          ) : loading ? (
            <UI.Box gap={2}>
              <UI.Skeleton height={32} width="full" />
              <UI.Skeleton height={32} width="full" />
            </UI.Box>
          ) : list.length === 0 ? (
            <UI.Text variant="muted" size="sm" data-testid="user-acceptances-empty">
              {t("userHistoryEmpty")}
            </UI.Text>
          ) : (
            <UI.Box gap={2}>
              {list.map((a) => (
                <UI.Box
                  key={a.id}
                  variant="panel"
                  padding={3}
                  data-testid="user-acceptance-row"
                >
                  <UI.Box direction="row" align="center" justify="between" gap={2} wrap>
                    <UI.Box gap={1} className="min-w-0">
                      <UI.Text as="span" weight="medium">
                        {t("editionRow", { version: a.version })}
                      </UI.Text>
                      <UI.Box direction="row" align="center" gap={2} wrap>
                        <UI.Text as="span" size="sm" variant="muted">
                          {formatAcceptedAt(a.accepted_at)}
                        </UI.Text>
                        <UI.Text as="span" size="sm" variant="muted" aria-hidden="true">
                          ·
                        </UI.Text>
                        <IpCell ip={a.ip} />
                        <UI.Text as="span" size="sm" variant="muted" aria-hidden="true">
                          ·
                        </UI.Text>
                        <BrowserCell userAgent={a.user_agent} source={a.source} />
                      </UI.Box>
                    </UI.Box>
                    {editionStatus(a.version, currentEdition) === "current" ? (
                      <UI.Badge variant="secondary" data-testid="user-acceptance-current">
                        {t("current")}
                      </UI.Badge>
                    ) : null}
                  </UI.Box>
                </UI.Box>
              ))}
            </UI.Box>
          )}
        </UI.Card.Content>
      </UI.Card>
    </UI.Tooltip.Provider>
  );
}
