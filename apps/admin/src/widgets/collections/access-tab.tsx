"use client";

// AccessTab — the Access tab of /collections/[collection]
// (SDL-309 + SDL-320, EP-13 §11). Four surfaces over the workspace's
// access plane, in the order a person actually needs them:
//
//   1. the effective answer — is this collection reachable without a
//      login right now, and with which fields;
//   2. the workspace's roles, with create / rename / delete;
//   3. the workspace's members — who holds those roles;
//   4. the grant matrix (role × action) for THIS collection, plus the
//      field allow-list of every grant that has one.
//
// 1-3 are PROJECT state, 4 is this COLLECTION's. The reading order
// follows that boundary rather than the API's shape.
//
// Presentational, like the rest of this module: every mutation is
// wired by the consuming page through the on* callbacks, and all copy
// arrives through `labels`.
//
// THE INVARIANT THAT MATTERS HERE: `fields` on a grant is an
// ALLOW-LIST and it is fail-closed (EP-13 §16). An empty list is not
// "all fields", it is "no fields" — a read grant carrying `[]` answers
// 200 with an empty `data` on every record, which reads as a broken
// collection rather than as a permissions decision. So ticking a
// field-scoped action here seeds the allow-list with the schema's
// current fields and the tab says so out loud; narrowing is a
// deliberate second step, never an accident of the default.

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import {
  Alert,
  Badge,
  Box,
  Button,
  FormControl,
  Table,
  Text,
} from "@markerloop/ui/ui";

import {
  FIELD_SCOPED_ACTIONS,
  GRANT_ACTIONS,
  type Collection,
  type CollectionField,
  type CollectionGrant,
  type GrantAction,
  type MemberUser,
  type ProjectMember,
  type ProjectRole,
} from "./types";

/** Name of the built-in role every anonymous caller resolves to. */
export const PUBLIC_ROLE_NAME = "public";
/** Name of the built-in role every logged-in caller reads with (a member
 * with its grants united with their own role's). */
export const AUTHENTICATED_ROLE_NAME = "authenticated";

export interface AccessTabLabels {
  // --- effective access ---
  statusHeading?: string;
  statusPublic?: string;
  statusPublicFields?: string;
  statusPublicNoFields?: string;
  statusPrivate?: string;
  statusPrivateHint?: string;
  statusAuthenticated?: string;
  // --- roles ---
  rolesHeading?: string;
  rolesIntro?: string;
  rolesEmpty?: string;
  newRole?: string;
  roleName?: string;
  roleKind?: string;
  kindAdmin?: string;
  kindConsumer?: string;
  kindHint?: string;
  builtinBadge?: string;
  columnRole?: string;
  columnKind?: string;
  columnActions?: string;
  rename?: string;
  save?: string;
  delete?: string;
  create?: string;
  creating?: string;
  cancel?: string;
  builtinImmutableHint?: string;
  // --- members ---
  membersHeading?: string;
  membersIntro?: string;
  membersNonMemberNote?: string;
  membersEmpty?: string;
  membersError?: string;
  membersNoRoles?: string;
  addMember?: string;
  memberFilterLabel?: string;
  memberFilterPlaceholder?: string;
  memberFilterHint?: string;
  memberFilterEmpty?: string;
  memberFilterLoading?: string;
  memberRoleLabel?: string;
  memberChangeRole?: string;
  memberNotInWorkspace?: string;
  memberInviteNeedsEmail?: string;
  memberInvite?: string;
  memberInviting?: string;
  memberInviteCopyLink?: string;
  memberInviteCopied?: string;
  memberInviteManage?: string;
  memberCandidatesError?: string;
  memberYou?: string;
  memberUnknown?: string;
  columnMember?: string;
  add?: string;
  adding?: string;
  // --- grants ---
  grantsHeading?: string;
  grantsIntro?: string;
  grantsEmptyRoles?: string;
  grantAll?: string;
  actionRead?: string;
  actionCreate?: string;
  actionUpdate?: string;
  actionDelete?: string;
  actionPublish?: string;
  actionSchema?: string;
  failClosedHeading?: string;
  failClosedNote?: string;
  // --- field allow-list ---
  fieldsHeading?: string;
  fieldsIntro?: string;
  fieldsEmpty?: string;
  fieldsAll?: string;
  fieldsNoneWarning?: string;
  fieldsCount?: string;
  noSchemaFields?: string;
  // --- shared states ---
  loading?: string;
  error?: string;
  unavailable?: string;
}

export interface AccessTabProps {
  /** Named in the grants heading — grants are per collection. */
  collection: Collection;
  /** Schema of THIS collection — the universe of the allow-lists. */
  fields: readonly CollectionField[];
  roles?: readonly ProjectRole[];
  grants?: readonly CollectionGrant[];
  isLoading?: boolean;
  /**
   * The gateway does not route the access plane. Distinct from "no
   * roles": one is a deployment fact, the other is data.
   */
  isUnavailable?: boolean;
  error?: string | null;
  isMutating?: boolean;
  mutationError?: string | null;
  onCreateRole?: (payload: {
    name: string;
    kind: "admin" | "consumer";
  }) => Promise<void>;
  onRenameRole?: (payload: { roleId: string; name: string }) => Promise<void>;
  onDeleteRole?: (roleId: string) => Promise<void>;

  // --- members (SDL-320) -------------------------------------------
  /** Rows carry their own `username`/`email` (`?include=profiles`,
   * SDL-727); a row without a profile renders as its raw id. */
  members?: readonly ProjectMember[];
  /** The signed-in admin. Their own row is marked, never hidden. */
  currentUserId?: string | null;
  isMembersLoading?: boolean;
  membersError?: string | null;
  /**
   * Who the picker offers: every member of the workspace (owner excluded),
   * from `members?include=profiles`. Filtered on the client by what the
   * admin types — the picker never searches outside the workspace
   * (SDL-727).
   */
  memberCandidates?: readonly MemberUser[];
  isMemberCandidatesLoading?: boolean;
  /** The members list behind the picker failed to load. */
  memberCandidatesError?: string | null;
  /**
   * Invite a person who is not in the workspace yet, by email
   * (`POST /workspaces/:id/invites`). Resolves to what to say — the
   * caller reads `email_status` (sent vs mail not sent, with the one-time
   * accept link) — and rejects with an Error whose message is already a
   * catalogue sentence (`inviteErrorKey`), never a raw server message.
   * Absent → the picker links to the workspace settings instead.
   */
  onInviteMember?: (email: string) => Promise<InviteNoticeView>;
  /** Where invites are managed; shown next to the "not in workspace" note. */
  inviteManageHref?: string;
  /**
   * Upsert. There is no separate "change role": `(project, user)` is
   * the server's primary key, so the same call does both, and the row's
   * role picker and the add form hand it identical payloads.
   */
  onPutMember?: (payload: { userId: string; roleId: string }) => Promise<void>;
  onRemoveMember?: (userId: string) => Promise<void>;
  /**
   * Flip one matrix cell. `grant` is the existing grant when the cell
   * is checked (→ revoke) and `null` when it is not (→ issue). The
   * page owns which fields a newly issued grant starts with.
   */
  onToggleGrant?: (payload: {
    role: ProjectRole;
    action: GrantAction;
    grant: CollectionGrant | null;
  }) => Promise<void>;
  onSetGrantFields?: (payload: {
    grantId: string;
    fields: string[];
  }) => Promise<void>;
  labels?: AccessTabLabels;
}

const ACTION_LABEL_KEY: Record<GrantAction, keyof AccessTabLabels> = {
  read: "actionRead",
  create: "actionCreate",
  update: "actionUpdate",
  delete: "actionDelete",
  publish: "actionPublish",
  schema: "actionSchema",
};

/** Grants of a collection, indexed by `${role_id}:${action}`. */
export function indexGrants(
  grants: readonly CollectionGrant[]
): Map<string, CollectionGrant> {
  const out = new Map<string, CollectionGrant>();
  for (const g of grants) out.set(`${g.role_id}:${g.action}`, g);
  return out;
}

/**
 * The one fact the tab exists to answer: what an anonymous caller gets
 * from the public data plane for this collection, right now.
 *
 * `readable` and `fields.length > 0` are separate on purpose. A read
 * grant with an empty allow-list is reachable AND useless — 200 with
 * `data: {}` on every record — and conflating the two is precisely how
 * a "public" collection ships that serves nothing.
 */
export function publicAccess(
  roles: readonly ProjectRole[],
  grants: readonly CollectionGrant[]
): { readable: boolean; fields: readonly string[] } {
  const publicRole = roles.find(
    (r) => r.is_builtin && r.name === PUBLIC_ROLE_NAME
  );
  if (!publicRole) return { readable: false, fields: [] };
  const grant = grants.find(
    (g) => g.role_id === publicRole.id && g.action === "read"
  );
  if (!grant) return { readable: false, fields: [] };
  return { readable: true, fields: grant.fields ?? [] };
}

export function AccessTab(props: AccessTabProps): ReactNode {
  const {
    collection,
    fields,
    roles = [],
    grants = [],
    isLoading = false,
    isUnavailable = false,
    error = null,
    isMutating = false,
    mutationError = null,
    onCreateRole,
    onRenameRole,
    onDeleteRole,
    members = [],
    currentUserId = null,
    isMembersLoading = false,
    membersError = null,
    memberCandidates = [],
    isMemberCandidatesLoading = false,
    memberCandidatesError = null,
    onInviteMember,
    inviteManageHref,
    onPutMember,
    onRemoveMember,
    onToggleGrant,
    onSetGrantFields,
    labels = {},
  } = props;

  const byCell = useMemo(() => indexGrants(grants), [grants]);
  const publicState = useMemo(
    () => publicAccess(roles, grants),
    [roles, grants]
  );

  if (isUnavailable) {
    return (
      <Box direction="column" gap={4} data-collections-access-tab="">
        <Alert data-collections-access-unavailable="">
          {labels.unavailable ??
            "Управление доступом недоступно через шлюз: collections-service его реализует, шлюз не проксирует /v1/workspaces/:id/roles и /v1/collections/:id/grants."}
        </Alert>
      </Box>
    );
  }

  return (
    <Box direction="column" gap={4} data-collections-access-tab="">
      <EffectiveAccessCard
        publicState={publicState}
        roles={roles}
        grants={grants}
        isLoading={isLoading}
        labels={labels}
      />

      {mutationError ? (
        <Alert variant="destructive" className="whitespace-pre-wrap">
          {mutationError}
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive" data-collections-access-error="">
          {labels.error ?? "Не удалось загрузить доступ."}
          {"\n"}
          {error}
        </Alert>
      ) : null}

      <RolesCard
        roles={roles}
        isLoading={isLoading}
        isMutating={isMutating}
        onCreateRole={onCreateRole}
        onRenameRole={onRenameRole}
        onDeleteRole={onDeleteRole}
        labels={labels}
      />

      {/* Members sit next to roles, not after the grant matrix: both
          are PROJECT state, while the matrix and the allow-list below
          are this COLLECTION's. Reading order follows that boundary —
          which roles exist, who holds them, then what those roles may
          do here. */}
      <MembersCard
        members={members}
        roles={roles}
        currentUserId={currentUserId}
        isLoading={isMembersLoading}
        error={membersError}
        isMutating={isMutating}
        candidates={memberCandidates}
        isCandidatesLoading={isMemberCandidatesLoading}
        candidatesError={memberCandidatesError}
        onInviteMember={onInviteMember}
        inviteManageHref={inviteManageHref}
        onPutMember={onPutMember}
        onRemoveMember={onRemoveMember}
        labels={labels}
      />

      <GrantMatrixCard
        collectionName={collection.name}
        roles={roles}
        byCell={byCell}
        isLoading={isLoading}
        isMutating={isMutating}
        onToggleGrant={onToggleGrant}
        labels={labels}
      />

      <GrantFieldsCard
        roles={roles}
        grants={grants}
        fields={fields}
        isMutating={isMutating}
        onSetGrantFields={onSetGrantFields}
        labels={labels}
      />
    </Box>
  );
}

// ---------------------------------------------------------------- 1.

function EffectiveAccessCard(props: {
  publicState: { readable: boolean; fields: readonly string[] };
  roles: readonly ProjectRole[];
  grants: readonly CollectionGrant[];
  isLoading: boolean;
  labels: AccessTabLabels;
}): ReactNode {
  const { publicState, roles, grants, isLoading, labels } = props;

  const authRole = roles.find(
    (r) => r.is_builtin && r.name === AUTHENTICATED_ROLE_NAME
  );
  const authReadable =
    !!authRole &&
    grants.some((g) => g.role_id === authRole.id && g.action === "read");

  return (
    <Box variant="panel" padding={4} data-collections-access-status="">
      <Box direction="column" gap={2}>
        <Text as="span" variant="kicker">
          {labels.statusHeading ?? "Кто читает эту коллекцию"}
        </Text>
        {isLoading ? (
          <Text as="span" variant="muted" size="sm">
            {labels.loading ?? "Загрузка…"}
          </Text>
        ) : publicState.readable ? (
          <Box direction="column" gap={1} data-collections-access-public="">
            <Box direction="row" gap={2} align="center" wrap>
              <Badge tone="green">{labels.statusPublic ?? "Публичная"}</Badge>
              {publicState.fields.length > 0 ? (
                <Text as="span" variant="muted" size="sm">
                  {labels.statusPublicFields ?? "Аноним видит поля"}:{" "}
                  {publicState.fields.join(", ")}
                </Text>
              ) : (
                <Text as="span" variant="danger" size="sm">
                  {labels.statusPublicNoFields ??
                    "Грант read есть, но allow-list пуст — ответ придёт с пустым data."}
                </Text>
              )}
            </Box>
          </Box>
        ) : (
          <Box direction="column" gap={1} data-collections-access-private="">
            <Box direction="row" gap={2} align="center" wrap>
              <Badge variant="secondary">
                {labels.statusPrivate ?? "Закрытая"}
              </Badge>
              <Text as="span" variant="muted" size="sm">
                {labels.statusPrivateHint ??
                  "У роли public нет гранта read — публичная плоскость отвечает 404."}
              </Text>
            </Box>
          </Box>
        )}
        {!isLoading && authReadable ? (
          <Text as="span" variant="meta">
            {labels.statusAuthenticated ??
              "Роль authenticated тоже читает: любой вошедший пользователь, участники пространства в том числе."}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------- 2.

function RolesCard(props: {
  roles: readonly ProjectRole[];
  isLoading: boolean;
  isMutating: boolean;
  onCreateRole?: AccessTabProps["onCreateRole"];
  onRenameRole?: AccessTabProps["onRenameRole"];
  onDeleteRole?: AccessTabProps["onDeleteRole"];
  labels: AccessTabLabels;
}): ReactNode {
  const {
    roles,
    isLoading,
    isMutating,
    onCreateRole,
    onRenameRole,
    onDeleteRole,
    labels,
  } = props;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Box variant="panel" padding={4} data-collections-roles-card="">
      <Box direction="column" gap={3}>
        <Box direction="row" align="center" justify="between" wrap>
          <Box direction="column" gap={1}>
            <Text as="span" variant="kicker">
              {labels.rolesHeading ?? "Роли пространства"}
            </Text>
            <Text as="span" variant="muted" size="sm">
              {labels.rolesIntro ??
                "Роли живут в пространстве, гранты — в коллекции. Роль сама по себе не даёт ничего."}
            </Text>
          </Box>
          {onCreateRole ? (
            <Button
              type="button"
              size="sm"
              // Not while the roles load: the page reports its workspace
              // as loading until it knows it, and a role created then has
              // no workspace to go to (SDL-621).
              disabled={formOpen || isMutating || isLoading}
              onClick={() => setFormOpen(true)}
            >
              {labels.newRole ?? "Новая роль"}
            </Button>
          ) : null}
        </Box>

        {formOpen && onCreateRole ? (
          <CreateRoleForm
            isMutating={isMutating}
            labels={labels}
            onCancel={() => setFormOpen(false)}
            onSubmit={async (payload) => {
              await onCreateRole(payload);
              setFormOpen(false);
            }}
          />
        ) : null}

        {isLoading ? (
          <Text as="span" variant="muted" size="sm">
            {labels.loading ?? "Загрузка…"}
          </Text>
        ) : roles.length === 0 ? (
          <Text
            as="span"
            variant="muted"
            size="sm"
            data-collections-roles-empty=""
          >
            {labels.rolesEmpty ??
              "Ролей нет. Обычно это значит, что пространство не досоздано: пять встроенных ролей сеются вместе с ним."}
          </Text>
        ) : (
          <Box variant="panel">
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{labels.columnRole ?? "Роль"}</Table.Head>
                  <Table.Head>{labels.columnKind ?? "Тип"}</Table.Head>
                  <Table.Head>{labels.columnActions ?? ""}</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {roles.map((role) => (
                  <RoleRow
                    key={role.id}
                    role={role}
                    isEditing={editingId === role.id}
                    onEdit={() => setEditingId(role.id)}
                    onCancelEdit={() => setEditingId(null)}
                    isMutating={isMutating}
                    onRenameRole={onRenameRole}
                    onDeleteRole={onDeleteRole}
                    labels={labels}
                  />
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        )}

        {!isLoading && roles.some((r) => r.is_builtin) ? (
          // Once, under the table, rather than repeated in every
          // built-in row: four copies of the same sentence is the
          // loudest thing on the card and says nothing new each time.
          <Text as="span" variant="meta">
            {labels.builtinImmutableHint ??
              "Встроенную роль нельзя переименовать или удалить"}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

function RoleRow(props: {
  role: ProjectRole;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  isMutating: boolean;
  onRenameRole?: AccessTabProps["onRenameRole"];
  onDeleteRole?: AccessTabProps["onDeleteRole"];
  labels: AccessTabLabels;
}): ReactNode {
  const {
    role,
    isEditing,
    onEdit,
    onCancelEdit,
    isMutating,
    onRenameRole,
    onDeleteRole,
    labels,
  } = props;
  const [draft, setDraft] = useState(role.name);

  return (
    <Table.Row data-collections-role-row={role.name}>
      <Table.Cell>
        {isEditing ? (
          <FormControl.Input
            aria-label={labels.roleName ?? "Название"}
            value={draft}
            disabled={isMutating}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <Box direction="row" gap={2} align="center" wrap>
            <Text as="span" size="sm" weight="medium">
              {role.name}
            </Text>
            {role.is_builtin ? (
              <Badge variant="outline">
                {labels.builtinBadge ?? "встроенная"}
              </Badge>
            ) : null}
          </Box>
        )}
      </Table.Cell>
      <Table.Cell>
        <Badge variant="secondary">
          {role.kind === "admin"
            ? (labels.kindAdmin ?? "admin")
            : (labels.kindConsumer ?? "consumer")}
        </Badge>
      </Table.Cell>
      <Table.Cell>
        {role.is_builtin ? (
          // The hint lives once under the table; a dash here keeps the
          // column aligned without repeating it four times.
          <Text as="span" variant="meta">
            —
          </Text>
        ) : isEditing ? (
          <Box direction="row" gap={2}>
            <Button
              type="button"
              size="sm"
              disabled={isMutating || !draft.trim()}
              onClick={async () => {
                if (!onRenameRole) return;
                await onRenameRole({ roleId: role.id, name: draft.trim() });
                onCancelEdit();
              }}
            >
              {labels.save ?? "Сохранить"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isMutating}
              onClick={() => {
                setDraft(role.name);
                onCancelEdit();
              }}
            >
              {labels.cancel ?? "Отмена"}
            </Button>
          </Box>
        ) : (
          <Box direction="row" gap={2}>
            {onRenameRole ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isMutating}
                onClick={onEdit}
              >
                {labels.rename ?? "Переименовать"}
              </Button>
            ) : null}
            {onDeleteRole ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isMutating}
                onClick={() => void onDeleteRole(role.id)}
              >
                {labels.delete ?? "Удалить"}
              </Button>
            ) : null}
          </Box>
        )}
      </Table.Cell>
    </Table.Row>
  );
}

function CreateRoleForm(props: {
  isMutating: boolean;
  labels: AccessTabLabels;
  onCancel: () => void;
  onSubmit: (payload: {
    name: string;
    kind: "admin" | "consumer";
  }) => Promise<void>;
}): ReactNode {
  const { isMutating, labels, onCancel, onSubmit } = props;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"admin" | "consumer">("consumer");

  return (
    <Box
      direction="column"
      gap={2}
      className="rounded-md border border-border p-3"
      data-collections-role-form=""
    >
      <Box variant="grid" columns={1} mdColumns={2} gap={3}>
        <FormControl.Field id="access-role-name" label={labels.roleName ?? "Название"}>
          <FormControl.Input
            type="text"
            value={name}
            disabled={isMutating}
            onChange={(e) => setName(e.target.value)}
          />
        </FormControl.Field>
        <FormControl.Field id="access-role-kind" label={labels.roleKind ?? "Тип"}>
          <FormControl.Select.Root
            value={kind}
            disabled={isMutating}
            onValueChange={(value) => setKind(value === "admin" ? "admin" : "consumer")}
          >
            <FormControl.Select.Trigger id="access-role-kind" fullWidth>
              <FormControl.Select.Value />
            </FormControl.Select.Trigger>
            <FormControl.Select.Content>
              <FormControl.Select.Item value="consumer">
                {labels.kindConsumer ?? "consumer"}
              </FormControl.Select.Item>
              <FormControl.Select.Item value="admin">{labels.kindAdmin ?? "admin"}</FormControl.Select.Item>
            </FormControl.Select.Content>
          </FormControl.Select.Root>
        </FormControl.Field>
      </Box>
      <Text as="span" variant="meta">
        {labels.kindHint ??
          "consumer — публичный API и токены; admin — панель. Тип неизменяем после создания."}
      </Text>
      <Box direction="row" gap={2}>
        <Button
          type="button"
          size="sm"
          disabled={isMutating || !name.trim()}
          onClick={() => void onSubmit({ name: name.trim(), kind })}
        >
          {isMutating
            ? (labels.creating ?? "Создание…")
            : (labels.create ?? "Создать")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isMutating}
          onClick={onCancel}
        >
          {labels.cancel ?? "Отмена"}
        </Button>
      </Box>
    </Box>
  );
}

// --------------------------------------------------------- 2b. members

/**
 * How a membership row names its person.
 *
 * The fallback is the raw `user_id`, and it is a feature: a membership
 * whose account the directory cannot resolve — deleted, or outside
 * what this admin may read — is still a live grant of access, and
 * rendering it as a blank row would hide exactly the row an audit
 * needs to see.
 */
export function describeMember(member: ProjectMember): {
  name: string;
  email: string | null;
  resolved: boolean;
} {
  if (!member.username) {
    return { name: member.user_id, email: null, resolved: false };
  }
  return { name: member.username, email: member.email ?? null, resolved: true };
}

/**
 * The picker's filter: a case-insensitive substring of username or email.
 * Email only matches where the server sent it — to the owner (SDL-615) —
 * so this never reveals more than the members answer already did.
 */
export function filterMemberCandidates(
  candidates: readonly MemberUser[],
  query: string
): MemberUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...candidates];
  return candidates.filter(
    (c) =>
      c.username.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q)
  );
}

/**
 * What the form shows after an invite: the caller builds the sentences
 * (it owns the catalogue and reads `email_status`); `acceptUrl` is the
 * one-time link, offered for copying — the only way to hand the invite over
 * when the mail did not go.
 */
export interface InviteNoticeView {
  kind: "sent" | "mailfail";
  title: string;
  body: string;
  acceptUrl: string;
}

/** Loose shape check — the server validates for real. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function MembersCard(props: {
  members: readonly ProjectMember[];
  roles: readonly ProjectRole[];
  currentUserId: string | null;
  isLoading: boolean;
  error: string | null;
  isMutating: boolean;
  candidates: readonly MemberUser[];
  isCandidatesLoading: boolean;
  candidatesError: string | null;
  onInviteMember?: AccessTabProps["onInviteMember"];
  inviteManageHref?: string;
  onPutMember?: AccessTabProps["onPutMember"];
  onRemoveMember?: AccessTabProps["onRemoveMember"];
  labels: AccessTabLabels;
}): ReactNode {
  const {
    members,
    roles,
    currentUserId,
    isLoading,
    error,
    isMutating,
    candidates,
    isCandidatesLoading,
    candidatesError,
    onInviteMember,
    inviteManageHref,
    onPutMember,
    onRemoveMember,
    labels,
  } = props;

  const [formOpen, setFormOpen] = useState(false);
  // The built-in `owner` role belongs to the workspace owner alone; the
  // server refuses to grant it (400 `workspace_owner_role_not_grantable`),
  // so it is never offered.
  const assignableRoles = useMemo(() => grantableRoles(roles), [roles]);

  return (
    <Box variant="panel" padding={4} data-collections-members-card="">
      <Box direction="column" gap={3}>
        <Box direction="row" align="center" justify="between" wrap>
          <Box direction="column" gap={1}>
            <Text as="span" variant="kicker">
              {labels.membersHeading ?? "Участники пространства"}
            </Text>
            <Text as="span" variant="muted" size="sm">
              {labels.membersIntro ??
                "Роль одна на человека: добавить того, кто уже в списке, — это сменить ему роль. Добавленный становится участником пространства и получает в нём права редактора страниц; удаление снимает и то и другое."}
            </Text>
          </Box>
          {onPutMember && assignableRoles.length > 0 ? (
            <Button
              type="button"
              size="sm"
              disabled={formOpen || isMutating}
              onClick={() => setFormOpen(true)}
            >
              {labels.addMember ?? "Добавить участника"}
            </Button>
          ) : null}
        </Box>

        {/* The non-obvious half of the feature, said once and out
            loud: membership only adds to `authenticated`, so removing a
            member revokes their role's rights, not their access. */}
        <Alert>
          <Text as="span" variant="muted" size="sm">
            {labels.membersNonMemberNote ??
              "Вошедший пользователь, которого здесь нет, читает не «ничем», а правами встроенной роли authenticated. Участник читает ими же плюс правами своей роли, поэтому удаление снимает только права роли — если у authenticated есть грант read, он продолжит видеть коллекцию."}
          </Text>
        </Alert>

        {error ? (
          <Alert variant="destructive" data-collections-members-error="">
            {labels.membersError ?? "Не удалось загрузить участников."}
            {"\n"}
            {error}
          </Alert>
        ) : null}

        {formOpen && onPutMember ? (
          <AddMemberForm
            roles={assignableRoles}
            candidates={candidates}
            isCandidatesLoading={isCandidatesLoading}
            candidatesError={candidatesError}
            isMutating={isMutating}
            onInviteMember={onInviteMember}
            inviteManageHref={inviteManageHref}
            labels={labels}
            onCancel={() => setFormOpen(false)}
            onSubmit={async (payload) => {
              await onPutMember(payload);
              setFormOpen(false);
            }}
          />
        ) : null}

        {isLoading ? (
          <Text as="span" variant="muted" size="sm">
            {labels.loading ?? "Загрузка…"}
          </Text>
        ) : members.length === 0 ? (
          // A failed request also leaves the list empty. Saying "no
          // members" underneath "could not load members" states as fact
          // the very thing that could not be determined, and the reader
          // believes the reassuring half; an empty table with headers
          // does the same thing more quietly. Under an error the card
          // says the error and stops.
          error ? null : (
            <Text
              as="span"
              variant="muted"
              size="sm"
              data-collections-members-empty=""
            >
              {labels.membersEmpty ??
                "Участников нет. Обычно это значит, что пространство не досоздано: владелец становится участником вместе с ним. Доступ к панели даёт владение, а не членство; на /data участник читает ролью authenticated плюс своей."}
            </Text>
          )
        ) : (
          <Box variant="panel">
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>
                    {labels.columnMember ?? "Пользователь"}
                  </Table.Head>
                  <Table.Head>{labels.columnRole ?? "Роль"}</Table.Head>
                  <Table.Head>{labels.columnActions ?? ""}</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {members.map((member) => (
                  <MemberRow
                    key={member.user_id}
                    member={member}
                    who={describeMember(member)}
                    roles={roles}
                    assignableRoles={assignableRoles}
                    isSelf={member.user_id === currentUserId}
                    isMutating={isMutating}
                    onPutMember={onPutMember}
                    onRemoveMember={onRemoveMember}
                    labels={labels}
                  />
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        )}

        {!isLoading && roles.length === 0 ? (
          <Text as="span" variant="meta">
            {labels.membersNoRoles ?? "Нет ролей — назначать нечего."}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

/** Roles a member may be given: everything but the built-in `owner`. */
export function grantableRoles(
  roles: readonly ProjectRole[]
): ProjectRole[] {
  return roles.filter((r) => !(r.is_builtin && r.name === "owner"));
}

function MemberRow(props: {
  member: ProjectMember;
  who: { name: string; email: string | null; resolved: boolean };
  roles: readonly ProjectRole[];
  /** `roles` minus the built-in `owner` — what the picker offers. */
  assignableRoles: readonly ProjectRole[];
  isSelf: boolean;
  isMutating: boolean;
  onPutMember?: AccessTabProps["onPutMember"];
  onRemoveMember?: AccessTabProps["onRemoveMember"];
  labels: AccessTabLabels;
}): ReactNode {
  const {
    member,
    who,
    roles,
    assignableRoles,
    isSelf,
    isMutating,
    labels,
  } = props;
  // The workspace owner is immutable (409 `workspace_owner_immutable` on
  // PUT and DELETE, SDL-617 C3): their row shows the role and no controls.
  const onPutMember = member.is_owner ? undefined : props.onPutMember;
  const onRemoveMember = member.is_owner ? undefined : props.onRemoveMember;
  // A role the picker does not offer (a legacy holder of `owner`) is
  // still shown as the current value rather than silently replaced by
  // the first option.
  const pickerRoles = assignableRoles.some((r) => r.id === member.role_id)
    ? assignableRoles
    : [...roles.filter((r) => r.id === member.role_id), ...assignableRoles];

  return (
    <Table.Row data-collections-member-row={who.name}>
      <Table.Cell>
        <Box direction="column" gap={1}>
          <Box direction="row" gap={2} align="center" wrap>
            <Text as="span" size="sm" weight="medium">
              {who.name}
            </Text>
            {isSelf ? (
              <Badge variant="outline">{labels.memberYou ?? "это вы"}</Badge>
            ) : null}
          </Box>
          {who.email ? (
            <Text as="span" variant="meta">
              {who.email}
            </Text>
          ) : !who.resolved ? (
            <Text as="span" variant="meta">
              {labels.memberUnknown ??
                "Пользователь не найден в справочнике — членство осталось"}
            </Text>
          ) : null}
        </Box>
      </Table.Cell>
      <Table.Cell>
        {onPutMember && assignableRoles.length > 0 ? (
          <FormControl.Select.Root
            value={member.role_id}
            disabled={isMutating}
            onValueChange={(value) =>
              void onPutMember({
                userId: member.user_id,
                roleId: value,
              })
            }
          >
            <FormControl.Select.Trigger
              aria-label={`${labels.memberRoleLabel ?? "Роль в пространстве"} · ${who.name}`}
              data-collections-member-role={who.name}
            >
              <FormControl.Select.Value />
            </FormControl.Select.Trigger>
            <FormControl.Select.Content>
              {pickerRoles.map((role) => (
                <FormControl.Select.Item key={role.id} value={role.id}>
                  {role.name}
                </FormControl.Select.Item>
              ))}
            </FormControl.Select.Content>
          </FormControl.Select.Root>
        ) : (
          <span data-collections-member-role-fixed={who.name}>
            <Badge variant="secondary">
              {roles.find((r) => r.id === member.role_id)?.name ??
                member.role_id}
            </Badge>
          </span>
        )}
      </Table.Cell>
      <Table.Cell>
        {onRemoveMember ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isMutating}
            onClick={() => void onRemoveMember(member.user_id)}
          >
            {labels.delete ?? "Удалить"}
          </Button>
        ) : (
          <Text as="span" variant="meta">
            —
          </Text>
        )}
      </Table.Cell>
    </Table.Row>
  );
}

/**
 * The picker.
 *
 * It offers the members of the workspace and nobody else (SDL-727): the
 * list comes from `members?include=profiles`, and what the admin types
 * filters it on the client — by username, and by email where the owner
 * was sent one. Nothing is looked up in the global user directory: that
 * needs `users:read:all`, and answering "who owns this email" for any
 * address would let an owner add a stranger without their consent and
 * probe addresses. A person outside the workspace gets an invite — a flow
 * with consent and its own limits.
 *
 * Every workspace member holds a role (collections 0006: `role_id` is
 * NOT NULL; a join without one gets the built-in `member`), so picking a
 * person is always a role change — one PUT upsert, one label.
 */
export function AddMemberForm(props: {
  roles: readonly ProjectRole[];
  candidates: readonly MemberUser[];
  isCandidatesLoading: boolean;
  candidatesError?: string | null;
  isMutating: boolean;
  onInviteMember?: AccessTabProps["onInviteMember"];
  inviteManageHref?: string;
  /** Pre-filled filter text (the smoke renders each branch with it). */
  initialSearch?: string;
  /** Pre-set invite outcome (the smoke renders each notice with it). */
  initialNotice?: InviteNoticeView | null;
  labels: AccessTabLabels;
  onCancel: () => void;
  onSubmit: (payload: { userId: string; roleId: string }) => Promise<void>;
}): ReactNode {
  const {
    roles,
    candidates,
    isCandidatesLoading,
    candidatesError = null,
    isMutating,
    onInviteMember,
    inviteManageHref,
    initialSearch = "",
    initialNotice = null,
    labels,
    onCancel,
    onSubmit,
  } = props;

  const [search, setSearch] = useState(initialSearch);
  const [selected, setSelected] = useState<MemberUser | null>(null);
  const [roleId, setRoleId] = useState<string>(roles[0]?.id ?? "");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<InviteNoticeView | null>(initialNotice);
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterMemberCandidates(candidates, search),
    [candidates, search]
  );
  const query = search.trim();
  const notInWorkspace =
    !isCandidatesLoading &&
    !candidatesError &&
    query.length > 0 &&
    filtered.length === 0;
  const canInvite = notInWorkspace && looksLikeEmail(query) && !!onInviteMember;

  return (
    <Box
      direction="column"
      gap={2}
      className="rounded-md border border-border p-3"
      data-collections-member-form=""
    >
      <Box variant="grid" columns={1} mdColumns={2} gap={3}>
        <FormControl.Field id="access-member-search" label={labels.memberFilterLabel ?? "Участник пространства"}>
          <FormControl.Input
            type="text"
            autoComplete="off"
            value={search}
            disabled={isMutating || inviting}
            placeholder={
              labels.memberFilterPlaceholder ?? "Имя пользователя или email"
            }
            onChange={(e) => {
              setSelected(null);
              setNotice(null);
              setCopied(false);
              setInviteError(null);
              setSearch(e.target.value);
            }}
          />
        </FormControl.Field>
        <FormControl.Field id="access-member-role" label={labels.memberRoleLabel ?? "Роль в пространстве"}>
          <FormControl.Select.Root
            value={roleId}
            disabled={isMutating}
            onValueChange={(value) => setRoleId(value)}
          >
            <FormControl.Select.Trigger id="access-member-role" fullWidth>
              <FormControl.Select.Value />
            </FormControl.Select.Trigger>
            <FormControl.Select.Content>
              {roles.map((role) => (
                <FormControl.Select.Item key={role.id} value={role.id}>
                  {role.name}
                </FormControl.Select.Item>
              ))}
            </FormControl.Select.Content>
          </FormControl.Select.Root>
        </FormControl.Field>
      </Box>

      <Text as="span" variant="meta">
        {labels.memberFilterHint ??
          "Выбор среди участников пространства — по имени пользователя или email. Кого нет в пространстве, пригласите по почте."}
      </Text>

      <Box direction="column" gap={1} data-collections-member-options="">
        {isCandidatesLoading ? (
          <Text as="span" variant="muted" size="sm">
            {labels.memberFilterLoading ?? labels.loading ?? "Загрузка…"}
          </Text>
        ) : candidatesError ? (
          <Alert
            variant="destructive"
            className="whitespace-pre-wrap"
            data-collections-member-candidates-error=""
          >
            {labels.memberCandidatesError ??
              "Не удалось загрузить участников пространства."}
            {"\n"}
            {candidatesError}
          </Alert>
        ) : notInWorkspace ? (
          <Box
            direction="column"
            gap={2}
            data-collections-member-not-in-workspace=""
          >
            <Text as="span" variant="muted" size="sm">
              {labels.memberNotInWorkspace ??
                "Человека нет в пространстве — пригласите его по почте."}
            </Text>
            {notice ? (
              <Alert
                data-collections-member-invite-notice={notice.kind}
                {...(notice.kind === "sent"
                  ? { "data-collections-member-invite-sent": "" }
                  : {})}
              >
                <Box direction="column" gap={2}>
                  <Text as="span" size="sm">
                    {notice.title}
                  </Text>
                  <Text as="span" variant="muted" size="sm">
                    {notice.body}
                  </Text>
                  <Box direction="row">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-collections-member-invite-copy=""
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(notice.acceptUrl)
                          .then(() => setCopied(true))
                          .catch(() => setCopied(false));
                      }}
                    >
                      {copied
                        ? (labels.memberInviteCopied ?? "Скопировано")
                        : (labels.memberInviteCopyLink ?? "Скопировать ссылку")}
                    </Button>
                  </Box>
                </Box>
              </Alert>
            ) : canInvite ? (
              <Box direction="row" gap={2} align="center" wrap>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={inviting || isMutating}
                  data-collections-member-invite=""
                  onClick={async () => {
                    if (!onInviteMember) return;
                    setInviting(true);
                    setInviteError(null);
                    try {
                      setNotice(await onInviteMember(query));
                    } catch (err) {
                      setInviteError(
                        err instanceof Error ? err.message : String(err)
                      );
                    } finally {
                      setInviting(false);
                    }
                  }}
                >
                  {inviting
                    ? (labels.memberInviting ?? "Отправка…")
                    : (labels.memberInvite ?? "Пригласить по почте")}
                </Button>
              </Box>
            ) : (
              <Text as="span" variant="meta">
                {labels.memberInviteNeedsEmail ??
                  "Введите почту целиком, чтобы отправить приглашение."}
              </Text>
            )}
            {inviteError ? (
              <Alert variant="destructive" className="whitespace-pre-wrap">
                {inviteError}
              </Alert>
            ) : null}
            {inviteManageHref ? (
              <Link
                href={inviteManageHref}
                className="text-sm underline underline-offset-2"
                data-collections-member-invite-manage=""
              >
                {labels.memberInviteManage ?? "Приглашения пространства"}
              </Link>
            ) : null}
          </Box>
        ) : filtered.length === 0 ? (
          <Text as="span" variant="muted" size="sm">
            {labels.memberFilterEmpty ?? "В пространстве пока нет других участников."}
          </Text>
        ) : (
          filtered.map((user) => {
            const isSelected = selected?.id === user.id;
            return (
              <Button
                key={user.id}
                type="button"
                size="sm"
                variant={isSelected ? "default" : "outline"}
                // A candidate is a row in a list, not a call to action:
                // left-aligned so the logins line up and the eye can
                // scan them.
                className="w-full justify-start text-left"
                data-collections-member-option={user.username}
                aria-pressed={isSelected}
                disabled={isMutating}
                onClick={() => setSelected(user)}
              >
                <Box as="span" direction="row" gap={2} align="center" wrap>
                  <Text as="span" size="sm">
                    {user.username}
                  </Text>
                  {user.email ? (
                    <Text as="span" variant="meta">
                      {user.email}
                    </Text>
                  ) : null}
                </Box>
              </Button>
            );
          })
        )}
      </Box>

      <Box direction="row" gap={2}>
        <Button
          type="button"
          size="sm"
          disabled={isMutating || !selected || !roleId}
          data-collections-member-submit=""
          onClick={() => {
            if (!selected || !roleId) return;
            void onSubmit({ userId: selected.id, roleId });
          }}
        >
          {isMutating
            ? (labels.adding ?? labels.creating ?? "Сохранение…")
            : (labels.memberChangeRole ?? "Сменить роль")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isMutating}
          onClick={onCancel}
        >
          {labels.cancel ?? "Отмена"}
        </Button>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------- 3.

function GrantMatrixCard(props: {
  collectionName: string;
  roles: readonly ProjectRole[];
  byCell: Map<string, CollectionGrant>;
  isLoading: boolean;
  isMutating: boolean;
  onToggleGrant?: AccessTabProps["onToggleGrant"];
  labels: AccessTabLabels;
}): ReactNode {
  const {
    collectionName,
    roles,
    byCell,
    isLoading,
    isMutating,
    onToggleGrant,
    labels,
  } = props;

  return (
    <Box variant="panel" padding={4} data-collections-grant-matrix="">
      <Box direction="column" gap={3}>
        <Box direction="column" gap={1}>
          <Text as="span" variant="kicker">
            {labels.grantsHeading ?? "Гранты коллекции"} · {collectionName}
          </Text>
          <Text as="span" variant="muted" size="sm">
            {labels.grantsIntro ??
              "Галочка — грант роли на действие с этой коллекцией. Снятие действует сразу."}
          </Text>
        </Box>

        <Alert>
          <Box direction="column" gap={1}>
            <Text as="span" size="sm" weight="medium">
              {labels.failClosedHeading ?? "Без гранта read — 404"}
            </Text>
            <Text as="span" variant="muted" size="sm">
              {labels.failClosedNote ??
                "Публичность — это грант роли public на read, а не флаг. Нет гранта — публичная плоскость отвечает 404, неотличимо от несуществующей коллекции: существование не разглашается."}
            </Text>
          </Box>
        </Alert>

        {isLoading ? (
          <Text as="span" variant="muted" size="sm">
            {labels.loading ?? "Загрузка…"}
          </Text>
        ) : roles.length === 0 ? (
          <Text as="span" variant="muted" size="sm">
            {labels.grantsEmptyRoles ?? "Нет ролей — гранты выдавать некому."}
          </Text>
        ) : (
          <Box variant="panel">
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{labels.columnRole ?? "Роль"}</Table.Head>
                  <Table.Head>{labels.grantAll ?? "Все"}</Table.Head>
                  {GRANT_ACTIONS.map((action) => (
                    <Table.Head key={action}>
                      {labels[ACTION_LABEL_KEY[action]] ?? action}
                    </Table.Head>
                  ))}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {roles.map((role) => (
                  <GrantRow
                    key={role.id}
                    role={role}
                    byCell={byCell}
                    isMutating={isMutating}
                    onToggleGrant={onToggleGrant}
                    labels={labels}
                  />
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function GrantRow(props: {
  role: ProjectRole;
  byCell: Map<string, CollectionGrant>;
  isMutating: boolean;
  onToggleGrant?: AccessTabProps["onToggleGrant"];
  labels: AccessTabLabels;
}): ReactNode {
  const { role, byCell, isMutating, onToggleGrant, labels } = props;

  const held = GRANT_ACTIONS.filter((a) => byCell.has(`${role.id}:${a}`));
  const all = held.length === GRANT_ACTIONS.length;
  const some = held.length > 0 && !all;

  /**
   * The row toggle fans out one mutation per cell rather than asking
   * for a batch endpoint that does not exist. Sequential, not
   * `Promise.all`: the grant list is refetched on every settle, and
   * six parallel writes against one collection produced interleaved
   * refetches that rendered a half-applied row.
   */
  const toggleAll = async (next: boolean) => {
    if (!onToggleGrant) return;
    for (const action of GRANT_ACTIONS) {
      const grant = byCell.get(`${role.id}:${action}`) ?? null;
      if (next === !!grant) continue;
      await onToggleGrant({ role, action, grant });
    }
  };

  return (
    <Table.Row data-collections-grant-row={role.name}>
      <Table.Cell>
        <Box direction="row" gap={2} align="center" wrap>
          <Text as="span" size="sm" weight="medium">
            {role.name}
          </Text>
          <Badge variant="secondary">
            {role.kind === "admin"
              ? (labels.kindAdmin ?? "admin")
              : (labels.kindConsumer ?? "consumer")}
          </Badge>
        </Box>
      </Table.Cell>
      <Table.Cell>
        <FormControl.Checkbox
          checked={all ? true : some ? "indeterminate" : false}
          disabled={isMutating || !onToggleGrant}
          aria-label={`${labels.grantAll ?? "Все"} · ${role.name}`}
          onCheckedChange={(checked) => void toggleAll(checked === true)}
        />
      </Table.Cell>
      {GRANT_ACTIONS.map((action) => {
        const grant = byCell.get(`${role.id}:${action}`) ?? null;
        return (
          <Table.Cell key={action}>
            <FormControl.Checkbox
              checked={!!grant}
              disabled={isMutating || !onToggleGrant}
              data-collections-grant-cell={`${role.name}:${action}`}
              aria-label={`${role.name} · ${labels[ACTION_LABEL_KEY[action]] ?? action}`}
              onCheckedChange={() =>
                void onToggleGrant?.({ role, action, grant })
              }
            />
          </Table.Cell>
        );
      })}
    </Table.Row>
  );
}

// ---------------------------------------------------------------- 4.

function GrantFieldsCard(props: {
  roles: readonly ProjectRole[];
  grants: readonly CollectionGrant[];
  fields: readonly CollectionField[];
  isMutating: boolean;
  onSetGrantFields?: AccessTabProps["onSetGrantFields"];
  labels: AccessTabLabels;
}): ReactNode {
  const { roles, grants, fields, isMutating, onSetGrantFields, labels } = props;

  const editable = useMemo(
    () =>
      grants.filter((g) =>
        FIELD_SCOPED_ACTIONS.includes(g.action as GrantAction)
      ),
    [grants]
  );

  return (
    <Box variant="panel" padding={4} data-collections-grant-fields="">
      <Box direction="column" gap={3}>
        <Box direction="column" gap={1}>
          <Text as="span" variant="kicker">
            {labels.fieldsHeading ?? "Allow-list полей"}
          </Text>
          <Text as="span" variant="muted" size="sm">
            {labels.fieldsIntro ??
              "Список разрешённых полей, не запрещённых. Пустой список — ни одного поля, а не все: ответ придёт с пустым data. Действия delete, publish и schema allow-list не читают."}
          </Text>
        </Box>

        {fields.length === 0 ? (
          <Text as="span" variant="muted" size="sm">
            {labels.noSchemaFields ??
              "В схеме коллекции нет полей — разрешать нечего."}
          </Text>
        ) : editable.length === 0 ? (
          <Text as="span" variant="muted" size="sm">
            {labels.fieldsEmpty ??
              "Нет грантов на read, create или update — allow-list появится вместе с ними."}
          </Text>
        ) : (
          <Box direction="column" gap={4}>
            {editable.map((grant) => (
              <GrantFieldsRow
                key={grant.id}
                grant={grant}
                role={roles.find((r) => r.id === grant.role_id) ?? null}
                fields={fields}
                isMutating={isMutating}
                onSetGrantFields={onSetGrantFields}
                labels={labels}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function GrantFieldsRow(props: {
  grant: CollectionGrant;
  role: ProjectRole | null;
  fields: readonly CollectionField[];
  isMutating: boolean;
  onSetGrantFields?: AccessTabProps["onSetGrantFields"];
  labels: AccessTabLabels;
}): ReactNode {
  const { grant, role, fields, isMutating, onSetGrantFields, labels } = props;

  const allowed = useMemo(() => new Set(grant.fields ?? []), [grant.fields]);
  const all = fields.every((f) => allowed.has(f.key));
  const some = !all && fields.some((f) => allowed.has(f.key));

  const setFields = (next: string[]) =>
    void onSetGrantFields?.({ grantId: grant.id, fields: next });

  const actionLabel =
    labels[ACTION_LABEL_KEY[grant.action as GrantAction]] ?? grant.action;

  return (
    <Box
      direction="column"
      gap={2}
      data-collections-grant-fields-row={`${role?.name ?? grant.role_id}:${grant.action}`}
    >
      <Box direction="row" gap={3} align="center" wrap>
        <FormControl.Checkbox
          checked={all ? true : some ? "indeterminate" : false}
          disabled={isMutating || !onSetGrantFields}
          aria-label={`${labels.fieldsAll ?? "Все поля"} · ${role?.name ?? grant.role_id} · ${actionLabel}`}
          onCheckedChange={(checked) =>
            setFields(checked === true ? fields.map((f) => f.key) : [])
          }
        />
        <Text as="span" size="sm" weight="medium">
          {role?.name ?? grant.role_id} · {actionLabel}
        </Text>
        <Badge variant="secondary">{`${allowed.size}/${fields.length}`}</Badge>
        {allowed.size === 0 ? (
          <Text as="span" variant="danger" size="sm">
            {labels.fieldsNoneWarning ?? "Ни одного поля — data придёт пустым."}
          </Text>
        ) : null}
      </Box>
      <Box direction="row" gap={4} wrap className="pl-8">
        {fields.map((field) => (
          <Box key={field.id} direction="row" gap={2} align="center">
            <FormControl.Checkbox
              checked={allowed.has(field.key)}
              disabled={isMutating || !onSetGrantFields}
              aria-label={`${role?.name ?? grant.role_id} · ${actionLabel} · ${field.key}`}
              onCheckedChange={(checked) => {
                const next = new Set(allowed);
                if (checked === true) next.add(field.key);
                else next.delete(field.key);
                setFields(fields.map((f) => f.key).filter((k) => next.has(k)));
              }}
            />
            <Text as="span" size="sm">
              {field.name}
            </Text>
            <Text as="span" variant="meta">
              {field.key}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
