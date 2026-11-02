// Collections-layer HTTP client (EP-13 / SDL-168). Talks to
// collections-service through the gateway at /api/v1/*. Uses the
// shared ApiClient for auth, refresh and envelope handling; list
// endpoints with pagination go through getEnvelope so meta
// {page, limit, total, total_pages} survives.
//
// Ownership is enforced server-side by the workspace → project →
// collection → record chain keyed on the JWT actor (gateway injects
// X-User-ID). That is why list endpoints take no owner param and
// workspace creation carries no owner field.

import { apiClient } from "./client";
import type { ApiResponseWithMeta, Meta } from "./types";
import type {
  AccessToken,
  Collection,
  CollectionField,
  CollectionGrant,
  CollectionRecord,
  GrantAction,
  IssuedToken,
  ProjectMember,
  ProjectRole,
  Workspace,
} from "@/widgets/collections";

function withQuery(path: string, usp: URLSearchParams): string {
  const s = usp.toString();
  return s ? `${path}?${s}` : path;
}

/** List page + guaranteed pagination meta. */
export interface Paged<T> {
  data: T[];
  meta: Meta;
}

// The backend serializes meta without omitempty, so it is always
// present on paged endpoints (total=0 on an empty page). The fallback
// below is defensive only — a non-enveloped or metaless response is
// treated as a single complete page rather than a crash.
function toPaged<T>(res: ApiResponseWithMeta<T[]>): Paged<T> {
  const data = res.data ?? [];
  const meta = res.meta ?? {
    page: 1,
    limit: data.length,
    total: data.length,
    total_pages: 1,
  };
  return { data, meta };
}

/** Shared page/limit/search/sort query params of paged lists. */
export interface PagedListParams {
  /** 1-based page number. */
  page?: number;
  /** Page size, 1..100 server-side. */
  limit?: number;
  /** Substring search (scope is endpoint-specific). */
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

function appendPagedParams(usp: URLSearchParams, params: PagedListParams) {
  if (params.page !== undefined) usp.append("page", String(params.page));
  if (params.limit !== undefined) usp.append("limit", String(params.limit));
  if (params.search) usp.append("search", params.search);
  if (params.sort_by) usp.append("sort_by", params.sort_by);
  if (params.sort_order) usp.append("sort_order", params.sort_order);
}

// ---- Workspaces ------------------------------------------------------

export interface WorkspaceCreatePayload {
  name: string;
  /**
   * The address <slug>.markerloop.com (SDL-759). Absent = the service picks one
   * from the name. Invalid / reserved → 400, taken → 409 workspace_slug_taken.
   */
  slug?: string;
}

/** GET /v1/workspaces/name-check — the state of one address (SDL-758). */
export type WorkspaceSlugStatus = "available" | "invalid" | "reserved" | "taken";

export interface WorkspaceSlugCheck {
  slug: string;
  status: WorkspaceSlugStatus;
}

export interface WorkspaceUpdatePayload {
  /** Only the display name is user-writable; billing_plan is not. */
  name?: string;
}

/** `used` of `limit` — one counting limit (collections-service SDL-661). */
export interface UsageCounter {
  used: number;
  limit: number;
}

/** GET /v1/workspaces/:id/usage. */
export interface WorkspaceUsage {
  /** The owner's workspaces, trashed included. */
  workspaces: UsageCounter;
  collections: UsageCounter;
  records: UsageCounter & { visitor_limit: number };
  record_max_bytes: number;
}

/** An element of GET /v1/workspaces?state=deleted. */
export interface DeletedWorkspace extends Workspace {
  days_left: number;
  /** When it went to the trash and when it is erased (RFC 3339). */
  deleted_at?: string;
  purge_after?: string;
}

export const collectionsWorkspacesApi = {
  /** Actor-scoped: the server lists workspaces of the JWT user. */
  list: (): Promise<Workspace[]> =>
    apiClient.get<Workspace[]>("/v1/workspaces"),
  get: (id: string): Promise<Workspace> =>
    apiClient.get<Workspace>(`/v1/workspaces/${id}`),
  /** Since SDL-617 the service seeds the workspace's storage in the same
   * transaction — one call, nothing to clean up on a failed seed. */
  create: (payload: WorkspaceCreatePayload): Promise<Workspace> =>
    apiClient.post<Workspace>("/v1/workspaces", payload),
  update: (id: string, payload: WorkspaceUpdatePayload): Promise<Workspace> =>
    apiClient.patch<Workspace>(`/v1/workspaces/${id}`, payload),
  /**
   * To the trash for trash_days (SDL-660): state=suspended, restorable.
   * `permanent` = «Delete forever»: purge_after=now, not restorable.
   */
  delete: (id: string, options?: { permanent?: boolean }): Promise<void> =>
    apiClient.delete(
      `/v1/workspaces/${id}${options?.permanent ? "?permanent=true" : ""}`
    ),
  /** The trash: suspended workspaces the actor owns, with days_left (SDL-660). */
  listDeleted: (): Promise<DeletedWorkspace[]> =>
    apiClient.get<DeletedWorkspace[]>("/v1/workspaces?state=deleted"),
  /** Back from the trash; owner only, 410 workspace_purged once erased. */
  restore: (id: string): Promise<Workspace> =>
    apiClient.post<Workspace>(`/v1/workspaces/${id}/restore`, {}),
  /** Counting limits of the workspace (SDL-661). */
  usage: (id: string): Promise<WorkspaceUsage> =>
    apiClient.get<WorkspaceUsage>(`/v1/workspaces/${id}/usage`),
  /**
   * Whether an address is free for a new workspace (SDL-758). Answers, does
   * not reserve: the POST may still meet 409 workspace_slug_taken. The admin
   * no longer calls POST /v1/workspaces/bootstrap: a workspace is created
   * only by the person, with the address they pick (SDL-759).
   */
  checkSlug: (slug: string): Promise<WorkspaceSlugCheck> =>
    apiClient.get<WorkspaceSlugCheck>(
      `/v1/workspaces/name-check?slug=${encodeURIComponent(slug)}`
    ),
};

// ---- Collections -----------------------------------------------------

export interface CollectionListParams extends PagedListParams {
  /** The workspace IS the scope (SDL-617a/SDL-621): collections-service
   * resolves it to the workspace's own storage. */
  workspace_id: string;
  /** `search` is ILIKE over name/key; sort_by allowlist: name, key,
   * created_at, updated_at. */
}

export interface CollectionCreatePayload {
  workspace_id: string;
  /**
   * Stable identifier, ^[a-z][a-z0-9_]{0,62}$, unique per workspace
   * (violation — 409 collection_key_taken), immutable post-create.
   */
  key: string;
  name: string;
  icon?: string | null;
}

export interface CollectionUpdatePayload {
  /** Only `name` and `icon` mutate; `key` is immutable. */
  name?: string;
  icon?: string | null;
}

export const collectionsApi = {
  list: (params: CollectionListParams): Promise<Paged<Collection>> => {
    const usp = new URLSearchParams();
    usp.append("workspace_id", params.workspace_id);
    appendPagedParams(usp, params);
    return apiClient
      .getEnvelope<Collection[]>(withQuery("/v1/collections", usp))
      .then(toPaged);
  },
  get: (id: string): Promise<Collection> =>
    apiClient.get<Collection>(`/v1/collections/${id}`),
  create: (payload: CollectionCreatePayload): Promise<Collection> =>
    apiClient.post<Collection>("/v1/collections", payload),
  update: (
    id: string,
    payload: CollectionUpdatePayload
  ): Promise<Collection> =>
    apiClient.patch<Collection>(`/v1/collections/${id}`, payload),
  delete: (id: string): Promise<void> =>
    apiClient.delete(`/v1/collections/${id}`),
};

// ---- Collection fields -----------------------------------------------

export interface FieldCreatePayload {
  key: string;
  name: string;
  /**
   * Immutable post-create. UI surfaces this as readonly when editing
   * an existing field — type changes are intentionally a delete +
   * recreate flow on the user side.
   */
  type: string;
  config?: Record<string, unknown>;
}

export interface FieldUpdatePayload {
  /** Only `name` and `config` mutate; `key` and `type` are immutable. */
  name?: string;
  config?: Record<string, unknown>;
}

// Fields are addressed under their parent collection.
export const collectionsFieldsApi = {
  list: (collectionId: string): Promise<CollectionField[]> =>
    apiClient.get<CollectionField[]>(
      `/v1/collections/${collectionId}/fields`
    ),
  create: (
    collectionId: string,
    payload: FieldCreatePayload
  ): Promise<CollectionField> =>
    apiClient.post<CollectionField>(
      `/v1/collections/${collectionId}/fields`,
      payload
    ),
  update: (
    collectionId: string,
    fieldId: string,
    payload: FieldUpdatePayload
  ): Promise<CollectionField> =>
    apiClient.patch<CollectionField>(
      `/v1/collections/${collectionId}/fields/${fieldId}`,
      payload
    ),
  delete: (collectionId: string, fieldId: string): Promise<void> =>
    apiClient.delete(
      `/v1/collections/${collectionId}/fields/${fieldId}`
    ),
};

// ---- Records ---------------------------------------------------------

export interface RecordListParams extends PagedListParams {
  collection_id: string;
  /** `search` is a substring across the JSONB payload; `sort_by`
   * accepts created_at, updated_at, or any field key. */
}

export interface RecordCreatePayload {
  collection_id: string;
  data: Record<string, unknown>;
}

export interface RecordUpdatePayload {
  data: Record<string, unknown>;
  /**
   * Optimistic-concurrency token from `CollectionRecord.version`. A
   * stale value gets 409 back with error `record_version_conflict`
   * and the CURRENT record in the envelope's `data` — the form layer
   * surfaces the divergence instead of silently overwriting.
   */
  version: number;
}

export const collectionsRecordsApi = {
  list: (params: RecordListParams): Promise<Paged<CollectionRecord>> => {
    const usp = new URLSearchParams();
    usp.append("collection_id", params.collection_id);
    appendPagedParams(usp, params);
    return apiClient
      .getEnvelope<CollectionRecord[]>(withQuery("/v1/records", usp))
      .then(toPaged);
  },
  /**
   * `GET /records` with a ready-made query — the pages DataView (SDL-640)
   * hands over `dataViewQuery(props, preset)` from the engine verbatim, so
   * `filter[field][op]` reaches the service in exactly the form the engine's
   * contract pins. Read as the signed-in person: the collection's own access
   * decides, a 403/404 comes back as is.
   */
  query: (query: Readonly<Record<string, string>>): Promise<Paged<CollectionRecord>> => {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) usp.append(key, value);
    return apiClient
      .getEnvelope<CollectionRecord[]>(withQuery("/v1/records", usp))
      .then(toPaged);
  },
  get: (id: string): Promise<CollectionRecord> =>
    apiClient.get<CollectionRecord>(`/v1/records/${id}`),
  create: (payload: RecordCreatePayload): Promise<CollectionRecord> =>
    apiClient.post<CollectionRecord>("/v1/records", payload),
  update: (
    id: string,
    payload: RecordUpdatePayload
  ): Promise<CollectionRecord> =>
    apiClient.patch<CollectionRecord>(`/v1/records/${id}`, payload),
  delete: (id: string): Promise<void> =>
    apiClient.delete(`/v1/records/${id}`),
};

// ---- Workspace roles ---------------------------------------------------

export interface RoleCreatePayload {
  name: string;
  /**
   * `admin` grants panel access, `consumer` backs the public data
   * plane and access tokens. Immutable after creation — there is no
   * PATCH for it, by design: flipping a consumer role to admin would
   * silently upgrade every token bound to it.
   */
  kind: "admin" | "consumer";
}

export interface RoleUpdatePayload {
  /** The only writable attribute. See `kind` above. */
  name: string;
}

/**
 * Roles of a workspace (SDL-167 / SDL-309; workspace-addressed since
 * SDL-621 — `/workspaces/:id/roles` is the SDL-617a alias of the old
 * per-project route).
 *
 * Four roles are seeded with every workspace and cannot be renamed or
 * deleted (400 `role_builtin_immutable`): `owner` and `editor` (admin),
 * `public` and `authenticated` (consumer). Custom roles on top are
 * free-form, name-unique within the workspace (409 `role_name_taken`),
 * and refuse to be deleted while a membership or a token holds them
 * (409 `role_in_use`) — their grants, by contrast, cascade away.
 */
export const collectionsRolesApi = {
  list: (workspaceId: string): Promise<ProjectRole[]> =>
    apiClient.get<ProjectRole[]>(`/v1/workspaces/${workspaceId}/roles`),
  create: (
    workspaceId: string,
    payload: RoleCreatePayload
  ): Promise<ProjectRole> =>
    apiClient.post<ProjectRole>(`/v1/workspaces/${workspaceId}/roles`, payload),
  update: (
    workspaceId: string,
    roleId: string,
    payload: RoleUpdatePayload
  ): Promise<ProjectRole> =>
    apiClient.patch<ProjectRole>(
      `/v1/workspaces/${workspaceId}/roles/${roleId}`,
      payload
    ),
  delete: (workspaceId: string, roleId: string): Promise<void> =>
    apiClient.delete(`/v1/workspaces/${workspaceId}/roles/${roleId}`),
};

// ---- Collection grants -----------------------------------------------

export interface GrantCreatePayload {
  role_id: string;
  action: GrantAction;
  /**
   * Field allow-list. FAIL-CLOSED: omitting it, or sending `[]`, means
   * *no* fields — a read grant like that answers 200 with an empty
   * `data` on every record. Callers that mean "everything the schema
   * has today" must enumerate it; the server has no wildcard.
   */
  fields?: string[];
}

export interface GrantUpdatePayload {
  /** Only the allow-list is mutable — role and action are not. */
  fields: string[];
}

/**
 * Grants of one collection: role × action, plus the field allow-list
 * (EP-13 §11.3).
 *
 * There is no PATCH for role or action: changing either is a different
 * grant, so the tab deletes and re-creates. A duplicate (role, action)
 * pair is refused with 409 `grant_exists`.
 *
 * Revocation takes effect immediately — `DELETE` invalidates the
 * decision cache in the same operation, so a public collection stops
 * being public on the next request, not on the next cache expiry.
 */
export const collectionsGrantsApi = {
  list: (collectionId: string): Promise<CollectionGrant[]> =>
    apiClient.get<CollectionGrant[]>(`/v1/collections/${collectionId}/grants`),
  create: (
    collectionId: string,
    payload: GrantCreatePayload
  ): Promise<CollectionGrant> =>
    apiClient.post<CollectionGrant>(
      `/v1/collections/${collectionId}/grants`,
      payload
    ),
  update: (
    collectionId: string,
    grantId: string,
    payload: GrantUpdatePayload
  ): Promise<CollectionGrant> =>
    apiClient.patch<CollectionGrant>(
      `/v1/collections/${collectionId}/grants/${grantId}`,
      payload
    ),
  delete: (collectionId: string, grantId: string): Promise<void> =>
    apiClient.delete(`/v1/collections/${collectionId}/grants/${grantId}`),
};

// ---- Workspace members (SDL-617) -------------------------------------

/**
 * A row of `GET /workspaces/:id/members` (SDL-609), only the fields the
 * admin reads. Since SDL-617 the service adds `role_id` — the member's role
 * in the workspace's single storage project — and only for the owner.
 */
interface WorkspaceMemberRow {
  workspace_id: string;
  user_id: string;
  created_at: string;
  /** `owner` for the workspace owner, `member` for everyone else. */
  role?: string;
  role_id?: string | null;
  /** With `?include=profiles` (SDL-615): any member sees `username`, only
   * the owner sees `email`. Both are absent when user-service did not
   * answer — the row then renders with its id (SDL-727). */
  username?: string;
  email?: string;
}

/**
 * Membership as the Access tab shows it: workspace members with their role.
 * Since collections 0006 `role_id` is NOT NULL — a join without a role gets
 * the built-in `member` — so every member is a row; the skip below only
 * guards an answer that omits the field (the owner sees `role_id`, others
 * do not), and that answer is not a row here.
 */
export function membersWithRole(
  rows: readonly WorkspaceMemberRow[]
): ProjectMember[] {
  const out: ProjectMember[] = [];
  for (const row of rows) {
    if (!row.role_id) continue;
    out.push({
      workspace_id: row.workspace_id,
      user_id: row.user_id,
      role_id: row.role_id,
      created_at: row.created_at,
      is_owner: row.role === "owner",
      username: row.username,
      email: row.email,
    });
  }
  return out;
}

function workspaceMembersPath(workspaceId: string): string {
  return `/v1/workspaces/${workspaceId}/members`;
}

export interface MemberPutPayload {
  user_id: string;
  role_id: string;
}

/**
 * Membership: user × role (SDL-320, EP-13 §11.2), read AND written by
 * workspace — one request each (SDL-617). The admin addresses no
 * per-project route at all; `smoke:collections` fails if a projects path
 * appears anywhere in `src/`.
 *
 * THE VERB IS PUT, NOT POST, and that is the contract rather than a
 * stylistic choice: `(workspace, user)` is the key, so "add a member"
 * and "change a member's role" are one upsert — there is no 409 for
 * adding someone twice, and no PATCH for the role.
 *
 * - `put` sends `{user_id, role_id}`: collections-service writes the
 *   workspace membership and the role in the workspace's storage in ONE
 *   transaction, so a refused role leaves no membership behind and there
 *   is nothing for the client to roll back. Refusals, all thrown as is:
 *   400 `role_not_in_workspace` (a foreign or missing role), 400
 *   `role_id_invalid`, 400 `workspace_owner_role_not_grantable` (the
 *   built-in `owner`), 409
 *   `workspace_has_many_projects`, 403 for a non-owner actor.
 * - `delete` removes the membership together with the person's roles in
 *   the workspace; a legacy holder of a role without a membership is
 *   removed the same way (200).
 * - The workspace OWNER is immutable on both verbs: 409
 *   `workspace_owner_immutable`. It is thrown, not swallowed — the
 *   screen explains it instead of pretending a role change happened.
 *
 * Removing a member is not the same as taking all access away on the
 * public data plane: every logged-in caller reads with the built-in
 * `authenticated` role, a member with that role's grants united with
 * their own role's, so a delete takes away only their role's rights —
 * see `ProjectMember`.
 */
export const collectionsMembersApi = {
  /**
   * Names come with the members (`?include=profiles`), not from the global
   * user directory: `/v1/users` needs `users:read:all`, which an ordinary
   * workspace owner does not hold (SDL-727).
   */
  list: async (workspaceId: string): Promise<ProjectMember[]> =>
    membersWithRole(
      await apiClient.get<WorkspaceMemberRow[]>(
        `${workspaceMembersPath(workspaceId)}?include=profiles`
      )
    ),
  /** Upsert: adds the member, or moves an existing one to a new role. */
  put: async (workspaceId: string, payload: MemberPutPayload): Promise<void> => {
    await apiClient.put<unknown>(workspaceMembersPath(workspaceId), payload);
  },
  delete: async (workspaceId: string, userId: string): Promise<void> => {
    await apiClient.delete(`${workspaceMembersPath(workspaceId)}/${userId}`);
  },
};

// ---- Workspace members with profiles, invites (SDL-615) -------------

/**
 * A workspace member as the settings screen shows it:
 * `GET /workspaces/:id/members?include=profiles`.
 *
 * `username` comes to any member; `email` and `invited_email` (the address
 * the invite went to, when the person joined by one) only to the owner.
 * All three are absent when user-service did not answer — the list still
 * renders, with the id in place of a name.
 */
export interface WorkspaceMemberProfile {
  workspace_id: string;
  user_id: string;
  created_at: string;
  /** `owner` | `member` — the gateway contract, always a string. */
  role: string;
  source?: "direct" | "invite";
  username?: string;
  email?: string;
  invited_email?: string;
  /**
   * A person's name when the profile carries one (EP-175 reads it for
   * «Edited by …»); none of today's services sends it — absent = use the
   * username.
   */
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export type WorkspaceInviteStatus = "valid" | "expired" | "used" | "revoked";

/** One invite of `GET /workspaces/:id/invites`. The token never comes back. */
export interface WorkspaceInvite {
  id: string;
  email: string;
  invited_by: string;
  created_at: string;
  last_sent_at: string;
  expires_at: string;
  status: WorkspaceInviteStatus;
  locale?: "ru" | "en" | "kk";
}

/**
 * `POST /invites` and `/resend` answer. `accept_url` comes exactly once —
 * the screen keeps it only for the «Copy link» of the notice it opened.
 */
export interface InviteCreated {
  invite: WorkspaceInvite;
  accept_url: string;
  email_status: "accepted_for_delivery" | "not_sent";
}

export interface InviteCreatePayload {
  email: string;
  locale?: "ru" | "en" | "kk";
}

function workspaceInvitesPath(workspaceId: string): string {
  return `/v1/workspaces/${workspaceId}/invites`;
}

export const collectionsWorkspaceMembersApi = {
  /**
   * `include=profiles` is opt-in on purpose: without it the answer is the
   * one the gateway reads on every cache miss, byte for byte.
   */
  list: (
    workspaceId: string,
    include?: "profiles"
  ): Promise<WorkspaceMemberProfile[]> =>
    apiClient.get<WorkspaceMemberProfile[]>(
      include
        ? `${workspaceMembersPath(workspaceId)}?include=${include}`
        : workspaceMembersPath(workspaceId)
    ),
};

export const collectionsInvitesApi = {
  list: (workspaceId: string): Promise<WorkspaceInvite[]> =>
    apiClient.get<WorkspaceInvite[]>(workspaceInvitesPath(workspaceId)),
  create: (
    workspaceId: string,
    payload: InviteCreatePayload
  ): Promise<InviteCreated> =>
    apiClient.post<InviteCreated>(workspaceInvitesPath(workspaceId), payload),
  resend: (workspaceId: string, inviteId: string): Promise<InviteCreated> =>
    apiClient.post<InviteCreated>(
      `${workspaceInvitesPath(workspaceId)}/${inviteId}/resend`
    ),
  revoke: async (workspaceId: string, inviteId: string): Promise<void> => {
    await apiClient.delete(`${workspaceInvitesPath(workspaceId)}/${inviteId}`);
  },
};

/**
 * What the invite link gives, read by its token: `POST /invites/preview`.
 * Any signed-in actor may ask; the invite is not spent. An unknown or
 * mangled token is a 404. `email` is the masked address it was sent to.
 */
export interface InvitePreview {
  status: WorkspaceInviteStatus;
  already_member: boolean;
  workspace: { id: string; name: string };
  inviter_username?: string;
  email?: string;
  expires_at: string;
}

export interface InviteAccepted {
  already_member: boolean;
  workspace: { id: string; name: string };
}

/**
 * The recipient's side of an invite (SDL-615). Both are POST with the token
 * in the body: a GET would put it in the request line, and mail scanners
 * that prefetch links must not be able to spend the invite.
 */
export const collectionsInviteRecipientApi = {
  preview: (token: string): Promise<InvitePreview> =>
    apiClient.post<InvitePreview>("/v1/invites/preview", { token }),
  accept: (token: string): Promise<InviteAccepted> =>
    apiClient.post<InviteAccepted>("/v1/invites/accept", { token }),
};

/**
 * True for the answer a workspace without its storage project gives on
 * `GET /collections?workspace_id=`: collections-service's own 404
 * (`not_found` in its envelope, `SoleProjectOf` → ErrNotFound). A foreign
 * workspace answers the same; a bare gateway 404 (route not proxied) does
 * not match.
 *
 * Since SDL-617 no such workspace is expected: `POST /workspaces` and the
 * bootstrap seed the storage in the same transaction, and the service
 * backfills stragglers on start (test 0, prod 0 after it ran). One can
 * still appear if its project is deleted through the API directly — until
 * the next backfill. The admin does not repair it (that would take a
 * per-project call); the overview names the state instead of showing the
 * raw 404.
 */
export function isWorkspaceWithoutStorage(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (
    (error as { status?: unknown }).status === 404 &&
    apiErrorCode(error) === "not_found"
  );
}

// ---- Access tokens ---------------------------------------------------

export interface TokenScopePayload {
  collection_id: string;
  action: "create" | "read" | "update" | "delete" | "publish" | "schema";
}

export interface TokenCreatePayload {
  name: string;
  /** MUST be a `consumer` role — see collectionsRolesApi. */
  role_id: string;
  /** RFC3339. Omitted/null issues a token that never expires. */
  expires_at?: string | null;
  /**
   * Optional narrowing to (collection, action) pairs. Intersects the
   * role's grants, never widens them.
   */
  scopes?: TokenScopePayload[];
}

export interface TokenRotatePayload {
  /**
   * Seconds the replaced token stays valid after the rotate. 0 (the
   * default) kills it immediately; over 604800 (7 days) is rejected
   * with 400 `token_grace_too_long`.
   */
  grace_seconds?: number;
}

/**
 * Tokens live under their workspace (SDL-617a alias, SDL-621). `create` and `rotate` answer with
 * IssuedToken — the one and only response carrying the plaintext
 * secret. Callers must hand it straight to a one-shot UI surface and
 * never store it: it is deliberately unrecoverable afterwards.
 */
export const collectionsTokensApi = {
  list: (workspaceId: string): Promise<AccessToken[]> =>
    apiClient.get<AccessToken[]>(`/v1/workspaces/${workspaceId}/tokens`),
  create: (
    workspaceId: string,
    payload: TokenCreatePayload
  ): Promise<IssuedToken> =>
    apiClient.post<IssuedToken>(`/v1/workspaces/${workspaceId}/tokens`, payload),
  rotate: (
    workspaceId: string,
    tokenId: string,
    payload: TokenRotatePayload = {}
  ): Promise<IssuedToken> =>
    apiClient.post<IssuedToken>(
      `/v1/workspaces/${workspaceId}/tokens/${tokenId}/rotate`,
      payload
    ),
  /** Soft revoke; idempotent. Returns the revoked token's metadata. */
  revoke: (workspaceId: string, tokenId: string): Promise<AccessToken> =>
    apiClient.delete<AccessToken>(
      `/v1/workspaces/${workspaceId}/tokens/${tokenId}`
    ),
};

// ---- Error helpers ---------------------------------------------------

/** Error code carried by the backend envelope on failures. */
export function apiErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return undefined;
  const code = (data as { error?: unknown }).error;
  return typeof code === "string" ? code : undefined;
}

/**
 * Code of the client-side refusal below — never sent by the server.
 * Reads through `apiErrorCode` like any envelope code, so a screen maps it
 * to a sentence in the same switch as the server's codes.
 */
export const WORKSPACE_UNRESOLVED = "workspace_unresolved";

/**
 * The workspace id a workspace-scoped write is about to address, or a
 * refusal before any request (SDL-621).
 *
 * The collection page derives its workspace by scanning the actor's
 * collection lists, so there is a window in which it is still null. A
 * mutation built in that window used to interpolate it into the path and
 * send `POST /v1/workspaces/null/roles`, which the gateway answers 403 —
 * surfacing as a bare "HTTP 403" instead of the real outcome. Call this
 * first thing in every such `mutationFn`.
 */
export function requireWorkspaceId(workspaceId: string | null): string {
  if (workspaceId) return workspaceId;
  throw Object.assign(
    new Error("The collection's workspace is not resolved yet"),
    { data: { error: WORKSPACE_UNRESOLVED } }
  );
}

/**
 * True when a 404 came from the *gateway's own router* rather than
 * from collections-service.
 *
 * The distinction is not cosmetic. collections-service always answers
 * in its envelope (`{success:false, error:"not_found"}`), so
 * `apiErrorCode()` yields a code. Gin's fallback for an unregistered
 * route answers the bare text `404 page not found`, which lands in
 * `error.data` as a string. A screen that cannot tell the two apart
 * reports "not found" for a route the gateway was simply never taught
 * to proxy — the exact failure mode this helper exists to name.
 *
 * Until gw!36/!37 the per-project tokens and roles routes were in that
 * state (verified on the test contour 12 Aug 2026); a self-hosted
 * gateway older than SDL-620a still lacks `/workspaces/:id/{roles,tokens}`.
 *
 * The predicate itself lives next to `readErrorBody`, whose result shape
 * it reads (`client.ts`), because the distinction is not this layer's:
 * `deleteAddress` in the pages section needs exactly the same one, and a
 * second copy of it is how the two drift apart.
 */
export { isGatewayRouteMissing } from "./client";

/**
 * On 409 `record_version_conflict` the envelope's `data` is the
 * current server-side record. Returns it, or undefined for any other
 * error shape.
 */
export function conflictCurrentRecord(
  error: unknown
): CollectionRecord | undefined {
  if (apiErrorCode(error) !== "record_version_conflict") return undefined;
  const data = (error as { data?: unknown }).data;
  const record = (data as { data?: unknown }).data;
  if (
    typeof record === "object" &&
    record !== null &&
    typeof (record as { id?: unknown }).id === "string" &&
    typeof (record as { version?: unknown }).version === "number"
  ) {
    return record as CollectionRecord;
  }
  return undefined;
}
