// Content-domain types shared between the collections shell and whatever
// renders collection data. Snake_case mirrors the JSON shape the backing
// API returns, so responses can be passed straight through without
// normalisation.
//
// These types stay provider-agnostic on purpose: they describe collections
// and records, not the product around them. Keep product-specific fields in
// the feature that consumes them.

export interface Workspace {
  id: string;
  name: string;
  owner_user_id: string;
  /**
   * The workspace's site address label (SDL-677): `<slug>.markerloop.com`. A
   * DNS label, unique. `null` on a row older than the column that has not
   * been backfilled yet; absent from an older service. Either way: no site
   * address is shown (SDL-687).
   */
  slug?: string | null;
  /**
   * Free-form plan identifier. The module does not interpret this;
   * the screens above it are free to map it onto billing tiers.
   * Empty string when there are no plans at all.
   */
  billing_plan: string;
  /**
   * Legacy flag of the retired personal workspace (SDL-610). Owner decision
   * 8 Oct 2026 (EP-155): there is no personal workspace — the screens no
   * longer read it (SDL-760). Kept in the DTO until the backend migration
   * drops the column.
   */
  is_personal?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  project_id: string;
  /**
   * Stable, immutable identifier. Survives renames so JSONB record
   * payloads keyed by it never need rewriting. Lower-snake_case by
   * convention.
   */
  key: string;
  /** Display name. Free to rename — `key` stays put. */
  name: string;
  /**
   * Built-in collections (e.g. `users`) are seeded by the backend and
   * cannot be deleted. Custom collections are user-created.
   */
  is_builtin: boolean;
  /** Optional iconography hint (lucide name, emoji, or URL). */
  icon?: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Number of records in the collection (SDL-238). Present only in the
   * *listing* response — the single `GET /collections/{id}` does not
   * compute it, and the field is absent there rather than `0`. Treat
   * `undefined` as "unknown", not as "empty": rendering a missing count
   * as 0 is the one thing this shape exists to prevent.
   */
  records_count?: number;
}

/**
 * Built-in field types the module recognises. Callers may extend the
 * registry with their own renderers, but the core set always
 * includes these — the type union is widened to `string` so unknown
 * types from the wire don't crash the table; renderers fall back to a
 * generic JSON view.
 */
export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "rich_text"
  | "image"
  | "relation"
  | "select"
  | "json"
  | (string & {});

export interface CollectionField {
  id: string;
  collection_id: string;
  /** Stable JSONB key for record payloads. Immutable once published. */
  key: string;
  /** Display name. Free to rename — `key` stays put. */
  name: string;
  type: FieldType;
  /** Type-specific configuration (e.g. select options, relation target). */
  config?: Record<string, unknown>;
  /** Schema version this field belongs to. Bumps on breaking changes. */
  schema_version: number;
  created_at: string;
  updated_at: string;
}

/**
 * Wire envelope for `rich_text` field values (EP-13). The server
 * stores the ProseMirror document as source of truth and derives
 * `text` for search/preview; clients render `text` and never parse
 * `doc` unless they embed a real editor. `format` versions the doc
 * schema — `"pm/1"` is the only value today.
 */
export interface RichTextEnvelope {
  format: "pm/1";
  /** ProseMirror JSON document. Opaque to non-editor renderers. */
  doc: Record<string, unknown>;
  /** Server-derived (and client-provided on write) plain text. */
  text: string;
}

/** Narrowing guard for values coming off the wire. */
export function isRichTextEnvelope(value: unknown): value is RichTextEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { format?: unknown }).format === "pm/1" &&
    typeof (value as { text?: unknown }).text === "string" &&
    typeof (value as { doc?: unknown }).doc === "object" &&
    (value as { doc?: unknown }).doc !== null
  );
}

export interface CollectionRecord {
  id: string;
  project_id: string;
  collection_id: string;
  /**
   * Free-form JSONB payload keyed by `CollectionField.key`. Renderers
   * read individual cells with a known field type from the collection
   * schema, so unknown keys are simply ignored.
   */
  data: Record<string, unknown>;
  schema_version: number;
  /**
   * Optional generated slug, derived by Postgres from `data->>'slug'`.
   * Read-only on the wire — never write it back.
   */
  slug?: string | null;
  /** Optimistic-concurrency token. Bumps on every update. */
  version: number;
  created_at: string;
  updated_at: string;
}

// ---- Access plane (SDL-218 / EP-13 §11–§12) --------------------------
//
// The API tab is a shop window onto the public data plane, so it needs
// the two access-control shapes that plane is built from: the project
// roles a token can be issued against, and the tokens themselves.

/**
 * A role inside a project. `kind` is `admin` (panel access) or
 * `consumer` (public data plane). Four roles are seeded with every
 * project: `owner`, `editor` (admin), `public`, `authenticated`
 * (consumer).
 *
 * Only a `consumer` role can back an access token — the server answers
 * 400 `token_role_not_consumer` otherwise, deliberately: an admin role
 * must never be wrapped into a long-lived opaque credential.
 */
export interface ProjectRole {
  id: string;
  project_id: string;
  name: string;
  kind: "admin" | "consumer" | (string & {});
  is_builtin: boolean;
  created_at: string;
}

/**
 * Access token metadata. The secret is NEVER part of this shape — the
 * server stores only `hex(HMAC-SHA256(pepper, secret))` and the wire
 * type has no field for the plaintext at all. `prefix` is the visible,
 * non-secret head of the token string, enough to tell two tokens apart
 * in a list.
 */
export interface AccessToken {
  id: string;
  project_id: string;
  name: string;
  prefix: string;
  role_id: string;
  created_by: string;
  expires_at?: string | null;
  /** Set on revoke — soft, so an audit trail survives. */
  revoked_at?: string | null;
  /** Id of the token this one replaced, when it came from a rotate. */
  rotated_from?: string | null;
  last_used_at?: string | null;
  created_at: string;
}

/**
 * Response of issue and rotate — the ONLY place the plaintext token
 * ever exists on the wire, and therefore the only chance the user has
 * to copy it. It must not be persisted anywhere on the client: not in
 * the query cache, not in a store, not in a log, not in a URL.
 */
export interface IssuedToken {
  token: string;
  access_token: AccessToken;
}

/**
 * Actions a grant can carry (EP-13 §11.2). `schema` is deliberately
 * separate from `update`: "edit the content" and "edit the structure"
 * are different rights, and collapsing them is how a content editor
 * ends up able to drop a field.
 *
 * The order is the order the matrix renders them in — read first
 * because it is the one almost every grant starts with.
 */
export const GRANT_ACTIONS = [
  "read",
  "create",
  "update",
  "delete",
  "publish",
  "schema",
] as const;

export type GrantAction = (typeof GRANT_ACTIONS)[number];

/**
 * Actions whose grant carries a meaningful field allow-list. `delete`,
 * `publish` and `schema` operate on the record or the collection as a
 * whole, so their `fields` is stored but never consulted — the tab does
 * not offer an allow-list editor for them rather than pretending the
 * list does something.
 */
export const FIELD_SCOPED_ACTIONS: readonly GrantAction[] = [
  "read",
  "create",
  "update",
];

/**
 * A grant: role × action × collection (EP-13 §11.3).
 *
 * TWO THINGS ABOUT THIS SHAPE ARE LOAD-BEARING.
 *
 * 1. Public access is a grant, not a flag. A collection is public
 *    exactly when the project's built-in `public` role holds a `read`
 *    grant on it. There is no `is_public` anywhere, and adding one
 *    would be a second source of truth for the same fact.
 *
 * 2. `fields` is fail-closed (§16). It is an allow-list, and an empty
 *    list means NO fields — not all of them. A read grant with
 *    `fields: []` therefore answers 200 with every record's `data`
 *    empty, which looks like a broken collection rather than a
 *    permissions decision. Any UI that creates a read grant has to say
 *    what goes in the list.
 */
export interface CollectionGrant {
  id: string;
  project_id: string;
  role_id: string;
  collection_id: string;
  action: GrantAction | (string & {});
  fields: string[];
  created_at: string;
}

/**
 * Membership of a user in a project (EP-13 §11.2).
 *
 * The row carries no id of its own — `(project_id, user_id)` IS the
 * primary key. That is why the write endpoint is a PUT upsert and the
 * delete is keyed by `user_id`: a person holds exactly ONE role per
 * project, so "add someone who is already a member" and "change their
 * role" are the same operation, and modelling them as two would invent
 * a state the server cannot represent.
 *
 * WHAT MAKES THIS LOAD-BEARING, and it is not obvious from the shape:
 * membership ADDS to what a *logged-in* caller reads on the public data
 * plane (`decide()` in collections-service, since 0006). Every logged-in
 * caller reads with the grants of the built-in `authenticated` role; a
 * member reads with those grants united with the grants of THIS role
 * (`access.Union`). So removing someone takes away exactly the rights
 * of their role — whatever `authenticated` holds, they keep, like any
 * signed-in user.
 *
 * Membership is not what gates the admin panel: that runs off owning
 * the workspace, keyed on the JWT actor. The owner's own membership is
 * immutable (409 `workspace_owner_immutable`).
 */
export interface ProjectMember {
  /** Read from `/workspaces/:id/members` since SDL-617 — the row is keyed
   * by the workspace, the role is still the storage project's. */
  workspace_id: string;
  user_id: string;
  role_id: string;
  created_at: string;
  /** The workspace owner (`role: "owner"` in `/workspaces/:id/members`).
   * Immutable on the server — PUT and DELETE answer 409
   * `workspace_owner_immutable` (SDL-617 C3) — so the row offers no
   * controls. */
  is_owner?: boolean;
  /** From `?include=profiles` (SDL-727); absent → the row shows `user_id`. */
  username?: string;
  /** Owner-only in the members answer; absent for everyone else. */
  email?: string;
}

/**
 * A person, as the add-member picker needs them: a member of the
 * workspace, read from `GET /workspaces/:id/members?include=profiles`
 * (SDL-727). The picker never reaches outside the workspace — someone who
 * is not in it gets an invite, not a lookup by email.
 */
export interface MemberUser {
  id: string;
  username: string;
  email?: string | null;
}
