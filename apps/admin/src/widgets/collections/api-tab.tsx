"use client";

// ApiTab — the API tab of /collections/[collection] (SDL-218,
// EP-31). A shop window onto what the server already does: the public
// data plane `/api/v1/data/:workspace/:collection`, copy-ready snippets
// generated from this collection's real schema, and the workspace's
// access tokens.
//
// Presentational, like the rest of this module: every mutation and
// every confirm is wired by the consuming page through the on*
// callbacks, and all copy arrives through `labels`.
//
// THE ONE INVARIANT THAT MATTERS HERE: a token's plaintext exists for
// exactly one render. `onCreateToken`/`onRotateToken` resolve with it,
// it goes into local component state, and it is shown once with a copy
// button. It is never written to the query cache, never logged, never
// put in a URL, and there is no way back to it — a lost secret is a
// rotate, by design.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  Alert,
  Badge,
  Box,
  Button,
  Code,
  FormControl,
  Text,
} from "@markerloop/ui/ui";

import { getApiBaseUrl } from "@/shared/lib/api/base-url";

import type {
  AccessToken,
  Collection,
  CollectionField,
  IssuedToken,
  ProjectRole,
} from "./types";

/**
 * Rate limits of the public data plane, as DOCUMENTED CONTOUR DEFAULTS
 * — not values read from the server. No API exposes them; the source of
 * truth is `dev-infra/apps/collections-service/base/configmap.yaml`
 * (`DATA_RATE_LIMIT_TOKEN_PER_MIN`, `DATA_RATE_LIMIT_IP_PER_MIN`,
 * `DATA_RATE_LIMIT_ANON_WRITE_PER_MIN`), read on 12 Aug 2026.
 *
 * They live in one named constant precisely so the drift is findable:
 * if the ConfigMap moves and this does not, the tab is lying, and the
 * lie is in exactly one place.
 */
export const DATA_PLANE_RATE_LIMITS = {
  /** Fixed window, seconds. */
  windowSeconds: 60,
  /** Per token_id, for `mlp_` tokens. */
  tokenPerMin: 100,
  /** Per (workspace, ip) — anonymous and JWT principals alike. */
  ipPerMin: 60,
  /** Anonymous POST is held to a tighter budget than anonymous reads. */
  anonWritePerMin: 10,
} as const;

/** Expiry presets of the issue form, in days. `null` — never expires. */
const EXPIRY_PRESETS: readonly { value: string; days: number | null }[] = [
  { value: "30", days: 30 },
  { value: "90", days: 90 },
  { value: "365", days: 365 },
  { value: "never", days: null },
];
const DEFAULT_EXPIRY = "90";

export interface ApiTabLabels {
  endpointsHeading?: string;
  endpointsIntro?: string;
  pathParamsNote?: string;
  authHeading?: string;
  authAnonymous?: string;
  authToken?: string;
  grantNoticeHeading?: string;
  grantNotice?: string;
  rateLimitHeading?: string;
  rateLimitNote?: string;
  rateLimitToken?: string;
  rateLimitIp?: string;
  rateLimitAnonWrite?: string;
  sampleHeading?: string;
  sampleNote?: string;
  snippetsHeading?: string;
  snippetsIntro?: string;
  copy?: string;
  copied?: string;
  copyFailed?: string;
  tokensHeading?: string;
  tokensIntro?: string;
  tokensEmpty?: string;
  tokensEmptyHint?: string;
  tokensLoading?: string;
  tokensError?: string;
  tokensUnavailable?: string;
  newToken?: string;
  tokenName?: string;
  tokenRole?: string;
  tokenExpiry?: string;
  expiryDays?: string;
  expiryNever?: string;
  expiryNeverWarning?: string;
  noConsumerRoles?: string;
  create?: string;
  creating?: string;
  cancel?: string;
  rotate?: string;
  revoke?: string;
  revoked?: string;
  active?: string;
  expired?: string;
  columnName?: string;
  columnPrefix?: string;
  columnRole?: string;
  columnCreated?: string;
  columnLastUsed?: string;
  columnExpires?: string;
  columnStatus?: string;
  never?: string;
  secretHeading?: string;
  secretOnceWarning?: string;
  dismiss?: string;
}

export interface ApiTabProps {
  collection: Collection;
  fields: readonly CollectionField[];
  /**
   * The workspace the collection lives in. Its UUID is what the public
   * plane addresses (SDL-617a); until it resolves the snippets fall
   * back to a `:workspace` placeholder rather than inventing a value.
   */
  workspaceId?: string | null;
  tokens?: readonly AccessToken[];
  roles?: readonly ProjectRole[];
  isTokensLoading?: boolean;
  /** Server error for the token list. */
  tokensError?: string | null;
  /**
   * The token endpoints exist in collections-service but are not (yet)
   * routed by the gateway — the page detects the bare-404 signature and
   * sets this, so the section explains itself instead of showing a
   * "not found" that means something else entirely.
   */
  isTokensUnavailable?: boolean;
  /**
   * Resolves with the plaintext token, or with `null` when the call
   * failed and the page has already surfaced why. These callbacks must
   * not reject: the alternative is a `void promise` in an onClick and
   * an unhandled rejection whenever the server says no.
   */
  onCreateToken?: (payload: {
    name: string;
    role_id: string;
    expires_at: string | null;
  }) => Promise<IssuedToken | null>;
  onRotateToken?: (tokenId: string) => Promise<IssuedToken | null>;
  /** The page owns the confirm — this fires after the user agreed. */
  onRevokeToken?: (tokenId: string) => Promise<void>;
  isMutatingToken?: boolean;
  /** Server error for token mutations. */
  mutationError?: string | null;
  /**
   * Absolute API base override. Left unset the tab derives it from
   * `window.location.origin` + `getApiBaseUrl()` after mount — there is
   * no origin during SSR, and a snippet with a guessed host is worse
   * than one that visibly says `<origin>`.
   */
  apiBaseUrl?: string;
  labels?: ApiTabLabels;
}

export function ApiTab(props: ApiTabProps): ReactNode {
  const {
    collection,
    fields,
    workspaceId = null,
    tokens = [],
    roles = [],
    isTokensLoading = false,
    tokensError = null,
    isTokensUnavailable = false,
    onCreateToken,
    onRotateToken,
    onRevokeToken,
    isMutatingToken = false,
    mutationError = null,
    apiBaseUrl,
    labels = {},
  } = props;

  // The absolute base is a client-only fact. SSR (and the smoke render)
  // gets the placeholder form, which is honest rather than wrong.
  const [resolvedBase, setResolvedBase] = useState<string | null>(
    apiBaseUrl ?? null
  );
  useEffect(() => {
    if (apiBaseUrl) return;
    setResolvedBase(`${window.location.origin}${getApiBaseUrl()}`);
  }, [apiBaseUrl]);

  const base = resolvedBase ?? `<origin>${getApiBaseUrl()}`;
  const workspaceRef = workspaceId ?? ":workspace";
  const dataUrl = `${base}/v1/data/${workspaceRef}/${collection.key}`;

  // ---- One-shot plaintext secret ----------------------------------
  // Local state, nothing else. Cleared by the user, and by any list
  // change that would make it stale.
  const [issued, setIssued] = useState<IssuedToken | null>(null);

  const sampleResponse = useMemo(
    () => buildSampleListResponse(fields),
    [fields]
  );
  const curlSnippet = useMemo(() => buildCurlSnippet(dataUrl), [dataUrl]);
  const fetchSnippet = useMemo(() => buildFetchSnippet(dataUrl), [dataUrl]);

  const consumerRoles = useMemo(
    () => roles.filter((r) => r.kind === "consumer"),
    [roles]
  );

  return (
    <Box direction="column" gap={4} data-collections-api-tab="">
      <EndpointCard
        dataUrl={dataUrl}
        sampleResponse={sampleResponse}
        labels={labels}
      />

      <SnippetsCard
        curl={curlSnippet}
        fetchCode={fetchSnippet}
        labels={labels}
      />

      <TokensCard
        tokens={tokens}
        roles={consumerRoles}
        isLoading={isTokensLoading}
        error={tokensError}
        isUnavailable={isTokensUnavailable}
        isMutating={isMutatingToken}
        mutationError={mutationError}
        issued={issued}
        onIssued={setIssued}
        onCreateToken={onCreateToken}
        onRotateToken={onRotateToken}
        onRevokeToken={onRevokeToken}
        labels={labels}
      />
    </Box>
  );
}

// ---------------------------------------------------------------- 1.

function EndpointCard(props: {
  dataUrl: string;
  sampleResponse: string;
  labels: ApiTabLabels;
}): ReactNode {
  const { dataUrl, sampleResponse, labels } = props;

  return (
    <Box variant="panel" padding={4}>
      <Box direction="column" gap={3}>
        <Box direction="column" gap={1}>
          <Text as="span" variant="kicker">
            {labels.endpointsHeading ?? "Endpoints"}
          </Text>
          <Text as="span" variant="muted" size="sm">
            {labels.endpointsIntro ?? "Public data plane of this collection."}
          </Text>
        </Box>

        <Box direction="column" gap={1.5}>
          <EndpointRow method="GET" url={dataUrl} />
          <EndpointRow method="POST" url={dataUrl} />
          <EndpointRow method="GET" url={`${dataUrl}/{record_id}`} />
        </Box>

        <Text as="span" variant="meta">
          {labels.pathParamsNote ??
            "`:workspace` is the workspace UUID; `:collection` is the collection key."}
        </Text>

        <Section heading={labels.authHeading ?? "Authentication"}>
          <Text as="span" variant="muted" size="sm">
            {labels.authAnonymous ??
              "No Authorization header — anonymous principal."}
          </Text>
          <Text as="span" variant="muted" size="sm">
            {labels.authToken ??
              "Authorization: Bearer mlp_… — the token's consumer role."}
          </Text>
        </Section>

        <Alert>
          <Box direction="column" gap={1}>
            <Text as="span" size="sm" weight="medium">
              {labels.grantNoticeHeading ?? "No read grant means 404"}
            </Text>
            <Text as="span" variant="muted" size="sm">
              {labels.grantNotice ??
                "Access is a grant. Without a read grant for the principal's role the answer is 404 — indistinguishable from a collection that does not exist. That is deliberate: existence is not leaked."}
            </Text>
          </Box>
        </Alert>

        <Section heading={labels.rateLimitHeading ?? "Rate limits"}>
          <Text as="span" variant="muted" size="sm">
            {labels.rateLimitToken ?? "Per token"}:{" "}
            {DATA_PLANE_RATE_LIMITS.tokenPerMin}/min
          </Text>
          <Text as="span" variant="muted" size="sm">
            {labels.rateLimitIp ?? "Per workspace + IP (anonymous and JWT)"}:{" "}
            {DATA_PLANE_RATE_LIMITS.ipPerMin}/min
          </Text>
          <Text as="span" variant="muted" size="sm">
            {labels.rateLimitAnonWrite ?? "Anonymous POST"}:{" "}
            {DATA_PLANE_RATE_LIMITS.anonWritePerMin}/min
          </Text>
          <Text as="span" variant="meta">
            {labels.rateLimitNote ??
              `Fixed ${DATA_PLANE_RATE_LIMITS.windowSeconds}s window. Documented contour defaults — the service does not report them over the API.`}
          </Text>
        </Section>

        <Section heading={labels.sampleHeading ?? "Example response"}>
          <Text as="span" variant="meta">
            {labels.sampleNote ??
              "Built from this collection's fields. The public projection carries no service fields — no project_id, no version, no schema_version."}
          </Text>
          {/* Помечен отдельно: утверждение «служебных полей нет»
              относится к самому payload, а не ко вкладке. Соседний
              абзац перечисляет эти поля словами, и проверка по всей
              вкладке ловила прозу вместо JSON. */}
          <Box data-collections-api-sample="">
            <CodeBlock code={sampleResponse} />
          </Box>
        </Section>
      </Box>
    </Box>
  );
}

function EndpointRow(props: { method: string; url: string }): ReactNode {
  return (
    <Box direction="row" gap={2} align="center" wrap>
      <Badge variant="secondary">{props.method}</Badge>
      <Code className="break-all">{props.url}</Code>
    </Box>
  );
}

// ---------------------------------------------------------------- 2.

function SnippetsCard(props: {
  curl: string;
  fetchCode: string;
  labels: ApiTabLabels;
}): ReactNode {
  const { curl, fetchCode, labels } = props;
  return (
    <Box variant="panel" padding={4}>
      <Box direction="column" gap={3}>
        <Box direction="column" gap={1}>
          <Text as="span" variant="kicker">
            {labels.snippetsHeading ?? "Snippets"}
          </Text>
          <Text as="span" variant="muted" size="sm">
            {labels.snippetsIntro ??
              "Generated from the current schema — copy and run."}
          </Text>
        </Box>
        <CopyableSnippet title="curl" code={curl} labels={labels} />
        <CopyableSnippet title="fetch" code={fetchCode} labels={labels} />
      </Box>
    </Box>
  );
}

function CopyableSnippet(props: {
  title: string;
  code: string;
  labels: ApiTabLabels;
}): ReactNode {
  const { title, code, labels } = props;
  return (
    <Box direction="column" gap={1.5}>
      <Box direction="row" align="center" justify="between">
        <Text as="span" size="sm" weight="medium">
          {title}
        </Text>
        <CopyButton value={code} labels={labels} />
      </Box>
      <CodeBlock code={code} />
    </Box>
  );
}

/**
 * Copy-to-clipboard with an honest failure path: the Clipboard API is
 * origin- and permission-gated, so a button that silently does nothing
 * is a real outcome and gets its own label rather than a fake "copied".
 */
function CopyButton(props: {
  value: string;
  labels: ApiTabLabels;
  size?: "sm" | "xs";
}): ReactNode {
  const { value, labels, size = "sm" } = props;
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const id = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(id);
  }, [state]);

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(value)
          .then(() => setState("done"))
          .catch(() => setState("failed"));
      }}
    >
      {state === "done"
        ? (labels.copied ?? "Copied")
        : state === "failed"
          ? (labels.copyFailed ?? "Copy failed")
          : (labels.copy ?? "Copy")}
    </Button>
  );
}

// ---------------------------------------------------------------- 3.

function TokensCard(props: {
  tokens: readonly AccessToken[];
  roles: readonly ProjectRole[];
  isLoading: boolean;
  error: string | null;
  isUnavailable: boolean;
  isMutating: boolean;
  mutationError: string | null;
  issued: IssuedToken | null;
  onIssued: (issued: IssuedToken | null) => void;
  onCreateToken?: ApiTabProps["onCreateToken"];
  onRotateToken?: ApiTabProps["onRotateToken"];
  onRevokeToken?: ApiTabProps["onRevokeToken"];
  labels: ApiTabLabels;
}): ReactNode {
  const {
    tokens,
    roles,
    isLoading,
    error,
    isUnavailable,
    isMutating,
    mutationError,
    issued,
    onIssued,
    onCreateToken,
    onRotateToken,
    onRevokeToken,
    labels,
  } = props;

  const [formOpen, setFormOpen] = useState(false);

  return (
    <Box variant="panel" padding={4}>
      <Box direction="column" gap={3}>
        <Box direction="row" align="center" justify="between" wrap>
          <Box direction="column" gap={1}>
            <Text as="span" variant="kicker">
              {labels.tokensHeading ?? "Workspace tokens"}
            </Text>
            <Text as="span" variant="muted" size="sm">
              {labels.tokensIntro ??
                "Opaque mlp_ credentials for the public plane."}
            </Text>
          </Box>
          {onCreateToken && !isUnavailable ? (
            <Button
              type="button"
              size="sm"
              // Not while tokens/roles load: the form offers the roles it
              // has at open time, and the page reports its workspace as
              // loading until it knows it (SDL-621).
              disabled={formOpen || isMutating || isLoading}
              onClick={() => setFormOpen(true)}
            >
              {labels.newToken ?? "New token"}
            </Button>
          ) : null}
        </Box>

        {issued ? (
          <IssuedTokenBanner
            issued={issued}
            onDismiss={() => onIssued(null)}
            labels={labels}
          />
        ) : null}

        {formOpen && onCreateToken ? (
          <CreateTokenForm
            roles={roles}
            isMutating={isMutating}
            labels={labels}
            onCancel={() => setFormOpen(false)}
            onSubmit={async (payload) => {
              const result = await onCreateToken(payload);
              // null — the call failed and the page is already showing
              // why; keep the form open with the user's input intact.
              if (!result) return;
              onIssued(result);
              setFormOpen(false);
            }}
          />
        ) : null}

        {mutationError ? (
          <Alert variant="destructive" className="whitespace-pre-wrap">
            {mutationError}
          </Alert>
        ) : null}

        {isUnavailable ? (
          <Alert>
            {labels.tokensUnavailable ??
              "Token management is not reachable through the gateway yet: collections-service implements it, the gateway does not route /v1/workspaces/:id/tokens."}
          </Alert>
        ) : isLoading ? (
          <Text as="span" variant="muted" size="sm">
            {labels.tokensLoading ?? "Loading…"}
          </Text>
        ) : error ? (
          <Alert variant="destructive">
            {labels.tokensError ?? "Failed to load tokens."}
            {"\n"}
            {error}
          </Alert>
        ) : tokens.length === 0 ? (
          <Box direction="column" gap={1} data-collections-tokens-empty="">
            <Text as="span" variant="muted" size="sm">
              {labels.tokensEmpty ?? "No tokens yet."}
            </Text>
            <Text as="span" variant="meta">
              {labels.tokensEmptyHint ??
                "Anonymous access needs no token — issue one only to grant a caller more than the public role has."}
            </Text>
          </Box>
        ) : (
          <TokensTable
            tokens={tokens}
            roles={roles}
            isMutating={isMutating}
            labels={labels}
            onRotate={
              onRotateToken
                ? async (id) => {
                    const result = await onRotateToken(id);
                    if (result) onIssued(result);
                  }
                : undefined
            }
            onRevoke={onRevokeToken}
          />
        )}
      </Box>
    </Box>
  );
}

/**
 * The plaintext secret, shown exactly once.
 *
 * Exported so it can be rendered — and screenshotted — in isolation:
 * the state that produces it cannot be reached from a contour where
 * the endpoint is unroutable, and an unverifiable one-shot surface is
 * how one-shot surfaces end up broken.
 */
export function IssuedTokenBanner(props: {
  issued: IssuedToken;
  onDismiss: () => void;
  labels?: ApiTabLabels;
}): ReactNode {
  const { issued, onDismiss, labels = {} } = props;
  return (
    <Alert data-collections-issued-token="">
      <Box direction="column" gap={2}>
        <Text as="span" size="sm" weight="semibold">
          {labels.secretHeading ?? "Copy this token now"}
        </Text>
        <Text as="span" variant="danger" size="sm">
          {labels.secretOnceWarning ??
            "Shown once. It is stored only as a hash — there is no way to see it again, only to rotate."}
        </Text>
        <Code className="break-all">{issued.token}</Code>
        <Box direction="row" gap={2}>
          <CopyButton value={issued.token} labels={labels} />
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            {labels.dismiss ?? "Dismiss"}
          </Button>
        </Box>
      </Box>
    </Alert>
  );
}

function CreateTokenForm(props: {
  roles: readonly ProjectRole[];
  isMutating: boolean;
  labels: ApiTabLabels;
  onCancel: () => void;
  onSubmit: (payload: {
    name: string;
    role_id: string;
    expires_at: string | null;
  }) => Promise<void>;
}): ReactNode {
  const { roles, isMutating, labels, onCancel, onSubmit } = props;
  const [name, setName] = useState("");
  // The chosen role is derived, not just stored: `roles` can arrive or
  // change after the form mounts (it used to open before they loaded, and
  // `useState(roles[0]?.id)` then stuck at "" — an empty select and a
  // Create button that never enabled). A choice still in the list is kept;
  // otherwise the first role is the answer (SDL-621).
  const [pickedRoleId, setRoleId] = useState(roles[0]?.id ?? "");
  const roleId = roles.some((r) => r.id === pickedRoleId)
    ? pickedRoleId
    : (roles[0]?.id ?? "");
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY);

  // A workspace without consumer roles cannot issue a token at all — the
  // server answers 400 token_role_not_consumer. Say so instead of
  // rendering a form whose Create button can only fail.
  if (roles.length === 0) {
    return (
      <Box
        direction="column"
        gap={2}
        className="rounded-md border border-border p-3"
        data-collections-token-form=""
      >
        <Text as="span" variant="muted" size="sm">
          {labels.noConsumerRoles ??
            "This workspace has no consumer role. A token can only be issued against one — admin roles are never wrapped into a credential."}
        </Text>
        <Box direction="row">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {labels.cancel ?? "Cancel"}
          </Button>
        </Box>
      </Box>
    );
  }

  const preset = EXPIRY_PRESETS.find((p) => p.value === expiry);
  const neverExpires = preset?.days === null;

  return (
    <Box
      direction="column"
      gap={2}
      className="rounded-md border border-border p-3"
      data-collections-token-form=""
    >
      <Box variant="grid" columns={1} mdColumns={3} gap={3}>
        <FormControl.Field id="token-name" label={labels.tokenName ?? "Name"}>
          <FormControl.Input
            type="text"
            value={name}
            disabled={isMutating}
            onChange={(e) => setName(e.target.value)}
          />
        </FormControl.Field>
        <FormControl.Field id="token-role" label={labels.tokenRole ?? "Role"}>
          <FormControl.Select.Root
            value={roleId}
            disabled={isMutating}
            onValueChange={(value) => setRoleId(value)}
          >
            <FormControl.Select.Trigger id="token-role" fullWidth>
              <FormControl.Select.Value />
            </FormControl.Select.Trigger>
            <FormControl.Select.Content>
              {roles.map((r) => (
                <FormControl.Select.Item key={r.id} value={r.id}>
                  {r.name}
                </FormControl.Select.Item>
              ))}
            </FormControl.Select.Content>
          </FormControl.Select.Root>
        </FormControl.Field>
        <FormControl.Field id="token-expiry" label={labels.tokenExpiry ?? "Expires"}>
          <FormControl.Select.Root
            value={expiry}
            disabled={isMutating}
            onValueChange={(value) => setExpiry(value)}
          >
            <FormControl.Select.Trigger id="token-expiry" fullWidth>
              <FormControl.Select.Value />
            </FormControl.Select.Trigger>
            <FormControl.Select.Content>
              {EXPIRY_PRESETS.map((p) => (
                <FormControl.Select.Item key={p.value} value={p.value}>
                  {p.days === null
                    ? (labels.expiryNever ?? "Never")
                    : `${p.days} ${labels.expiryDays ?? "days"}`}
                </FormControl.Select.Item>
              ))}
            </FormControl.Select.Content>
          </FormControl.Select.Root>
        </FormControl.Field>
      </Box>

      {neverExpires ? (
        <Text as="span" variant="danger" size="xs">
          {labels.expiryNeverWarning ??
            "A token that never expires can only be retired by hand."}
        </Text>
      ) : null}

      <Box direction="row" gap={2}>
        <Button
          type="button"
          size="sm"
          disabled={isMutating || name.trim() === "" || roleId === ""}
          onClick={() => {
            void onSubmit({
              name: name.trim(),
              role_id: roleId,
              expires_at: expiresAtFrom(preset?.days ?? null),
            });
          }}
        >
          {isMutating
            ? (labels.creating ?? "Creating…")
            : (labels.create ?? "Create")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isMutating}
          onClick={onCancel}
        >
          {labels.cancel ?? "Cancel"}
        </Button>
      </Box>
    </Box>
  );
}

function TokensTable(props: {
  tokens: readonly AccessToken[];
  roles: readonly ProjectRole[];
  isMutating: boolean;
  labels: ApiTabLabels;
  onRotate?: (tokenId: string) => Promise<void>;
  onRevoke?: (tokenId: string) => Promise<void>;
}): ReactNode {
  const { tokens, roles, isMutating, labels, onRotate, onRevoke } = props;
  const roleName = (id: string) =>
    roles.find((r) => r.id === id)?.name ?? id.slice(0, 8);

  return (
    // `text-xs`, not `sm`: eight columns plus two row actions do not fit
    // the shell's ~825px main pane at 1440, and at `sm` the revoke button
    // sat behind a horizontal scroll — a destructive action nobody would
    // find. The overflow wrapper stays for genuinely narrow viewports.
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border">
            <Th>{labels.columnName ?? "Name"}</Th>
            <Th>{labels.columnPrefix ?? "Prefix"}</Th>
            <Th>{labels.columnRole ?? "Role"}</Th>
            <Th>{labels.columnCreated ?? "Created"}</Th>
            <Th>{labels.columnLastUsed ?? "Last used"}</Th>
            <Th>{labels.columnExpires ?? "Expires"}</Th>
            <Th>{labels.columnStatus ?? "Status"}</Th>
            <Th> </Th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => {
            const status = tokenStatus(token);
            return (
              <tr
                key={token.id}
                className="border-b border-border last:border-0"
              >
                <Td>{token.name}</Td>
                {/* Prefix only — the secret half never left the server. */}
                <Td>
                  <Code>{token.prefix}…</Code>
                </Td>
                <Td>{roleName(token.role_id)}</Td>
                <Td>{formatDate(token.created_at)}</Td>
                <Td>{formatDate(token.last_used_at) || "—"}</Td>
                <Td>
                  {token.expires_at
                    ? formatDate(token.expires_at)
                    : (labels.never ?? "never")}
                </Td>
                <Td>
                  <Badge
                    variant={status === "revoked" ? "outline" : "secondary"}
                    tone={status === "active" ? "green" : "red"}
                  >
                    {status === "active"
                      ? (labels.active ?? "active")
                      : status === "expired"
                        ? (labels.expired ?? "expired")
                        : (labels.revoked ?? "revoked")}
                  </Badge>
                </Td>
                <Td>
                  {status !== "revoked" ? (
                    <Box direction="row" gap={1.5}>
                      {onRotate ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={isMutating}
                          onClick={() => {
                            void onRotate(token.id);
                          }}
                        >
                          {labels.rotate ?? "Rotate"}
                        </Button>
                      ) : null}
                      {onRevoke ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={isMutating}
                          className="border-destructive text-destructive"
                          onClick={() => {
                            void onRevoke(token.id);
                          }}
                        >
                          {labels.revoke ?? "Revoke"}
                        </Button>
                      ) : null}
                    </Box>
                  ) : null}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- small building blocks -------------------------------------------

function Section(props: { heading: string; children: ReactNode }): ReactNode {
  return (
    <Box direction="column" gap={1}>
      <Text as="span" variant="label">
        {props.heading}
      </Text>
      {props.children}
    </Box>
  );
}

function CodeBlock(props: { code: string }): ReactNode {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">
      <code>{props.code}</code>
    </pre>
  );
}

function Th(props: { children: ReactNode }): ReactNode {
  return (
    // Headers wrap on purpose: forcing nowrap widens the "last used"
    // column past its own content and pushes the row actions off-screen,
    // which is the defect this table just came back from.
    <th className="px-2 py-2 font-medium text-muted-foreground">
      {props.children}
    </th>
  );
}

function Td(props: { children: ReactNode }): ReactNode {
  return <td className="px-2 py-2 align-middle">{props.children}</td>;
}

// ---- pure helpers ----------------------------------------------------

type TokenStatus = "active" | "expired" | "revoked";

export function tokenStatus(token: AccessToken): TokenStatus {
  if (token.revoked_at) return "revoked";
  if (token.expires_at && Date.parse(token.expires_at) <= Date.now()) {
    return "expired";
  }
  return "active";
}

function formatDate(value?: string | null): string {
  if (!value) return "";
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return value;
  return new Date(ts).toISOString().slice(0, 10);
}

function expiresAtFrom(days: number | null): string | null {
  if (days === null) return null;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/**
 * A sample value per field type. Illustrative, not authoritative: the
 * point is to show the *shape* a caller has to parse — notably that
 * `rich_text` is an envelope and `relation` is an array of ids, both of
 * which are the things people get wrong on first contact.
 */
function sampleValueFor(field: CollectionField): unknown {
  switch (field.type) {
    case "number":
      return 42;
    case "boolean":
      return true;
    case "date":
      return "2026-08-12T09:00:00Z";
    case "rich_text":
      return {
        format: "pm/1",
        doc: { type: "doc", content: [] },
        text: "Plain-text projection",
      };
    case "image":
      return "https://cdn.example.com/asset.png";
    case "relation":
      return ["11111111-2222-4333-8444-555555555555"];
    case "json":
      return {};
    default:
      return `${field.name}`;
  }
}

/** The `data` object of one public record, keyed by field key. */
export function buildSampleRecordData(
  fields: readonly CollectionField[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.key] = sampleValueFor(f);
  return out;
}

/**
 * A full list response. Kept in sync with `PublicRecordListResponse`
 * and `PublicRecord` — service fields are absent on purpose, that is
 * the projection's whole contract.
 */
export function buildSampleListResponse(
  fields: readonly CollectionField[]
): string {
  return JSON.stringify(
    {
      success: true,
      message: "OK",
      data: [
        {
          id: "11111111-2222-4333-8444-555555555555",
          data: buildSampleRecordData(fields),
          created_at: "2026-08-12T09:00:00Z",
          updated_at: "2026-08-12T09:00:00Z",
        },
      ],
      meta: { page: 1, limit: 20, total: 1, total_pages: 1 },
    },
    null,
    2
  );
}

export function buildCurlSnippet(dataUrl: string): string {
  return [
    "# read (anonymous)",
    `curl -s '${dataUrl}?page=1&limit=20'`,
    "",
    "# read (workspace token)",
    `curl -s '${dataUrl}?page=1&limit=20' \\`,
    `  -H 'Authorization: Bearer mlp_…'`,
    "",
    "# create",
    `curl -s -X POST '${dataUrl}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H 'Authorization: Bearer mlp_…' \\`,
    `  -d '{"data":{}}'`,
  ].join("\n");
}

export function buildFetchSnippet(dataUrl: string): string {
  return [
    "// read (anonymous — drop the headers entirely)",
    `const res = await fetch("${dataUrl}?page=1&limit=20", {`,
    '  headers: { Authorization: "Bearer mlp_…" },',
    "});",
    "const { data, meta } = await res.json();",
    "",
    "// create",
    `await fetch("${dataUrl}", {`,
    '  method: "POST",',
    "  headers: {",
    '    "Content-Type": "application/json",',
    '    Authorization: "Bearer mlp_…",',
    "  },",
    "  body: JSON.stringify({ data: {} }),",
    "});",
  ].join("\n");
}
