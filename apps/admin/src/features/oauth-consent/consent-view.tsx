"use client";

import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { AuthCenter } from "@/shared/components/auth-center";
import { WELCOME_PATH } from "@/shared/config/product-routes";
import { useTranslations } from "@/shared/hooks";
import { Alert, Badge, Box, Button, Card, Skeleton, Text } from "@markerloop/ui/ui";
import type { ConsentErrorKind, ConsentWorkspace } from "./consent-model";

/**
 * The OAuth consent screen for an MCP agent (SDL-693, EP-20).
 *
 * No canvas exists for it (checked /design-system and packages/ui on
 * 3 Oct 2026), so it is assembled from what the invite screen already uses:
 * AuthCenter + Card 448, Alert, Badge, Button. The only element without a kit
 * twin is the workspace choice — the kit has no RadioGroup — so it is native
 * radios in bordered rows, the invite summary box repeated per workspace.
 *
 * Security copy is the point of the screen: dynamic client registration is
 * open to anyone, so the client's name is self-declared. The redirect host —
 * where the code will actually go — is printed as large as the name, and the
 * client is always marked unverified.
 */

export type ConsentViewState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "final"; error: Extract<ConsentErrorKind, "expired" | "decided"> }
  | { kind: "load-failed" }
  | {
      kind: "ready";
      clientName: string;
      clientId: string;
      /** ASCII (punycode) — never the raw host from the server; null — unreadable. */
      redirectHost: string | null;
      /** International / unparsable host: warn that it may imitate another site. */
      redirectLookalike: boolean;
      workspaces: ConsentWorkspace[];
      selected: string | null;
      busy: "approve" | "deny" | null;
      error: Exclude<ConsentErrorKind, "expired" | "decided"> | null;
    }
  | { kind: "redirecting"; redirectHost: string };

export interface ConsentViewActions {
  onSelect: (workspaceId: string) => void;
  onApprove: () => void;
  onDeny: () => void;
  onRetry: () => void;
  homeHref: string;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AuthCenter>
      <Card fullWidth maxWidth={448} data-testid="consent-card">
        <Card.Content>
          <Box direction="column" gap={5}>
            <Text as="h1" size="2xl" weight="bold">
              {title}
            </Text>
            {children}
          </Box>
        </Card.Content>
      </Card>
    </AuthCenter>
  );
}

function ClientIdentity({
  clientName,
  clientId,
  redirectHost,
  redirectLookalike,
}: {
  clientName: string;
  clientId: string;
  redirectHost: string | null;
  redirectLookalike: boolean;
}) {
  const t = useTranslations("oauthConsent");
  return (
    <Box direction="column" gap={3} data-testid="consent-client">
      <Box direction="column" gap={1}>
        <Box direction="row" align="center" gap={2} wrap>
          <Text as="span" size="2xl" weight="bold" wrap="break" className="min-w-0" data-testid="consent-client-name">
            {clientName}
          </Text>
          <Badge tone="orange" data-testid="consent-unverified">
            <ShieldAlert size={14} aria-hidden="true" />
            {t("unverified")}
          </Badge>
        </Box>
        <Text as="span" size="xs" variant="muted" className="break-all">
          {t("clientId", { id: clientId })}
        </Text>
      </Box>
      <Box direction="column" gap={1}>
        <Text as="span" size="sm" variant="muted">
          {t("redirectLabel")}
        </Text>
        <Text as="span" size="xl" weight="bold" className="break-all" data-testid="consent-redirect-host">
          {redirectHost ?? t("hostUnreadable")}
        </Text>
      </Box>
      {redirectHost === null ? (
        <Alert variant="destructive" data-testid="consent-host-unreadable">
          {t("hostUnreadableNote")}
        </Alert>
      ) : redirectLookalike ? (
        <Alert variant="destructive" data-testid="consent-lookalike">
          {t("lookalikeNote", { host: redirectHost })}
        </Alert>
      ) : null}
      <Alert data-testid="consent-unverified-note">{t("unverifiedNote")}</Alert>
    </Box>
  );
}

function WorkspaceChoice({
  workspaces,
  selected,
  disabled,
  onSelect,
}: {
  workspaces: ConsentWorkspace[];
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("oauthConsent");
  if (workspaces.length === 0) {
    return (
      <Alert variant="destructive" data-testid="consent-no-workspaces">
        <Box direction="column" gap={1}>
          <Text as="span" size="sm">
            {t("noWorkspaces")}
          </Text>
          {/* A new tab: this screen keeps the agent's request, so after
              creating the workspace the person comes back and reloads it
              (SDL-759). */}
          <a
            href={WELCOME_PATH}
            target="_blank"
            rel="noopener"
            className="text-sm font-medium underline underline-offset-4"
            data-testid="consent-create-workspace"
          >
            {t("createWorkspaceLink")}
          </a>
        </Box>
      </Alert>
    );
  }
  return (
    <Box direction="column" gap={2} role="radiogroup" aria-label={t("workspaceLabel")} data-testid="consent-workspaces">
      <Text as="span" size="sm" weight="medium">
        {t("workspaceLabel")}
      </Text>
      {workspaces.map((w) => {
        const checked = selected === w.id;
        return (
          <label
            key={w.id}
            className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${
              checked ? "border-primary" : "border-border"
            }`}
            data-testid="consent-workspace"
            data-workspace-id={w.id}
            data-checked={checked ? "true" : "false"}
          >
            <input
              type="radio"
              name="consent-workspace"
              value={w.id}
              checked={checked}
              disabled={disabled}
              onChange={() => onSelect(w.id)}
              className="size-4 shrink-0 accent-primary"
            />
            <Text as="span" size="sm" weight="medium" className="min-w-0 grow break-words">
              {w.name}
            </Text>
            <Badge variant={w.role === "owner" ? "default" : "secondary"} data-testid="consent-workspace-role">
              {t(w.role === "owner" ? "roleOwner" : "roleMember")}
            </Badge>
          </label>
        );
      })}
    </Box>
  );
}

const ERROR_KEY: Record<Exclude<ConsentErrorKind, "expired" | "decided">, string> = {
  "signed-out": "errorSignedOut",
  "not-member": "errorNotMember",
  unavailable: "errorUnavailable",
  "redirect-mismatch": "errorRedirect",
  failed: "errorFailed",
};

export function ConsentView({
  state,
  actions,
}: {
  state: ConsentViewState;
  actions: ConsentViewActions;
}) {
  const t = useTranslations("oauthConsent");

  switch (state.kind) {
    case "loading":
      return (
        <Shell title={t("title")}>
          <Box direction="column" gap={3} data-testid="consent-loading">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </Box>
        </Shell>
      );
    case "missing":
    case "final": {
      const key =
        state.kind === "missing"
          ? "missing"
          : state.error === "decided"
            ? "decided"
            : "expired";
      return (
        <Shell title={t(`${key}Title`)}>
          <Box direction="column" gap={4} data-testid={`consent-${key}`}>
            <Alert>{t(`${key}Note`)}</Alert>
            <Button asChild variant="outline" fullWidth data-testid="consent-home">
              <a href={actions.homeHref}>{t("home")}</a>
            </Button>
          </Box>
        </Shell>
      );
    }
    case "load-failed":
      return (
        <Shell title={t("title")}>
          <Box direction="column" gap={4} data-testid="consent-load-failed">
            <Alert variant="destructive">{t("loadFailed")}</Alert>
            <Button fullWidth onClick={actions.onRetry} data-testid="consent-retry">
              {t("retry")}
            </Button>
          </Box>
        </Shell>
      );
    case "redirecting":
      return (
        <Shell title={t("title")}>
          <Box direction="column" gap={3} data-testid="consent-redirecting">
            <Text size="sm" variant="muted">
              {t("redirecting", { host: state.redirectHost })}
            </Text>
          </Box>
        </Shell>
      );
    case "ready": {
      const busy = state.busy !== null;
      return (
        <Shell title={t("title")}>
          <Box direction="column" gap={5} data-testid="consent-ready">
            <ClientIdentity
              clientName={state.clientName}
              clientId={state.clientId}
              redirectHost={state.redirectHost}
              redirectLookalike={state.redirectLookalike}
            />
            <WorkspaceChoice
              workspaces={state.workspaces}
              selected={state.selected}
              disabled={busy}
              onSelect={actions.onSelect}
            />
            <Box as="ul" direction="column" gap={1} className="list-disc pl-5" data-testid="consent-terms">
              <Text as="li" size="sm">{t("termRole")}</Text>
              <Text as="li" size="sm">{t("termLifetime")}</Text>
              <Text as="li" size="sm">{t("termFiles")}</Text>
            </Box>
            {state.error ? (
              <Alert variant="destructive" data-testid="consent-error">
                {t(ERROR_KEY[state.error])}
              </Alert>
            ) : null}
            <Box direction="column" gap={2}>
              <Button
                fullWidth
                disabled={busy || state.selected === null || state.redirectHost === null}
                onClick={actions.onApprove}
                data-testid="consent-approve"
              >
                {state.busy === "approve" ? t("approving") : t("approve")}
              </Button>
              <Button
                fullWidth
                variant="outline"
                disabled={busy}
                onClick={actions.onDeny}
                data-testid="consent-deny"
              >
                {state.busy === "deny" ? t("denying") : t("deny")}
              </Button>
            </Box>
          </Box>
        </Shell>
      );
    }
  }
}
