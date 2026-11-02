import type { SaunaAnySchema, SaunaId, SaunaSchema } from "../../schema/types";
import { migrateSaunaSchema } from "../../schema/migrate";
import { validateSaunaSchema } from "../../schema/validate";
import { SaunaAccessDeniedError, SaunaConflictError, SaunaNotFoundError } from "../errors";
import { ComponentDepthError, SAUNA_COMPONENT_DEPTH_EXCEEDED, SAUNA_COMPONENT_MAX_DEPTH } from "../../core/component-depth";
import type { HttpProviderHeaders } from "../http/provider";
import type {
  SaunaProvider,
  SaunaPutOptions,
  SaunaPutResult,
  SaunaSnapshot,
  SaunaVersion,
} from "../types";

/**
 * Which pages-service document a provider instance reads and writes.
 *
 * - `pages`  → `/v1/pages/pages/{id}`, the tree lives in `body`
 * - `blocks` → `/v1/pages/blocks/{id}`, the tree lives in `schema`
 *
 * Routes are not schema documents (they carry the link logic, not a tree),
 * so they have no provider — the architecture decision: `route` is the link, `page` only
 * the composition.
 */
export type PagesServiceDocumentKind = "pages" | "blocks";

export type PagesServiceProviderOptions = {
  /**
   * Gateway API prefix, everything before `/v1`. In the admin this is
   * `getApiBaseUrl()` — relative `/api` on the deployed contours, which the
   * admin's ingress proxies to the gateway. Server-side callers pass an
   * absolute one: `https://staging.example.com/api` (the product host
   * proxies `/api/v1`), or `https://api.staging.example.com` — the API host
   * serves `/v1` at its root, `…/api/v1` there is a 404.
   */
  apiBaseUrl: string;
  /**
   * The workspace every request is scoped to. Sent as the `workspace_id`
   * query parameter; the gateway checks the actor's membership and injects
   * the verified scope, pages-service answers 403 on a mismatch.
   */
  workspaceId: string;
  /** Default `pages`. */
  kind?: PagesServiceDocumentKind;
  /** Override `globalThis.fetch` (tests, instrumentation). */
  fetch?: typeof globalThis.fetch;
  /** Extra request headers — typically `Authorization: Bearer <jwt>`. */
  headers?: HttpProviderHeaders;
  /** Read cache hint. Default `no-store`: authoring reads must be fresh. */
  cache?: RequestCache;
};

/** One document as pages-service returns it inside `{ success, data }`. */
type PagesServiceDocument = {
  id?: string;
  workspace_id?: string;
  version?: number;
  body?: unknown;
  schema?: unknown;
};

type Envelope = {
  success?: boolean;
  data?: PagesServiceDocument;
  // pages-service answers with a string code; the gateway, when it refuses
  // the request itself, nests `{ code, message, details }` instead.
  error?: string | { code?: string; message?: string; details?: string };
  message?: string;
};

function errorCode(env: Envelope): string | undefined {
  return typeof env.error === "string" ? env.error : env.error?.code;
}

function errorMessage(env: Envelope): string | undefined {
  if (env.message) return env.message;
  return typeof env.error === "object" ? env.error?.message : undefined;
}

const TREE_FIELD: Record<PagesServiceDocumentKind, "body" | "schema"> = {
  pages: "body",
  blocks: "schema",
};

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

async function resolveHeaders(h: HttpProviderHeaders | undefined): Promise<Record<string, string>> {
  if (!h) return {};
  if (typeof h === "function") return await h();
  return h;
}

async function readEnvelope(res: Response): Promise<Envelope> {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as Envelope;
  } catch {
    return { message: text };
  }
}

function toVersion(doc: PagesServiceDocument | undefined, id: SaunaId): SaunaVersion {
  if (!doc || typeof doc.version !== "number" || !Number.isFinite(doc.version)) {
    throw new Error(`pages-service provider: response for "${id}" carries no numeric version`);
  }
  return String(doc.version);
}

function parseVersion(v: SaunaVersion, id: SaunaId): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `pages-service provider: ifMatch for "${id}" must be a pages-service version (positive integer), got "${v}"`
    );
  }
  return n;
}

/**
 * `SaunaProvider` over pages-service, reached through the Markerloop gateway
 * with a workspace scope (SDL-603). Replaces the reference's provider wiring
 * to sauna-service's slug-keyed flat-compat layer.
 *
 * Contract mapping:
 *   - `SaunaId` is the pages-service document UUID (page or block id).
 *   - `SaunaVersion` is the document's integer `version`, stringified.
 *   - `put` without `ifMatch` reads the current version first — an
 *     unconditional write, as the `SaunaProvider` contract defines it.
 *   - 404 → `SaunaNotFoundError` (pages-service also answers 404 for a
 *     document of another workspace when the scope itself is valid).
 *   - 401 / 403 → `SaunaAccessDeniedError` — a foreign `workspace_id`
 *     is refused, never served.
 *   - 409 `*_version_conflict` → `SaunaConflictError` with the server's
 *     current version.
 *
 * Defence in depth: a 200 whose document claims a different workspace is
 * treated as a refusal too, so a misrouted response can never hand the
 * caller another workspace's tree.
 */
export function createPagesServiceProvider(opts: PagesServiceProviderOptions): SaunaProvider {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "createPagesServiceProvider: no `fetch` available. Pass `opts.fetch` or run on a fetch-capable runtime."
    );
  }
  if (!opts.workspaceId) {
    throw new Error("createPagesServiceProvider: `workspaceId` is required — every editor route is workspace-scoped.");
  }

  const kind = opts.kind ?? "pages";
  const field = TREE_FIELD[kind];
  const cache = opts.cache ?? "no-store";
  const base = `${stripTrailingSlash(opts.apiBaseUrl)}/v1/pages/${kind}`;

  const urlFor = (id: SaunaId) =>
    `${base}/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(opts.workspaceId)}`;

  async function failOn(res: Response, id: SaunaId, method: string): Promise<never> {
    const env = await readEnvelope(res);
    if (res.status === 404) {
      throw new SaunaNotFoundError(`Schema not found: ${id}`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new SaunaAccessDeniedError(res.status, errorCode(env), errorMessage(env));
    }
    if (res.status === 409) {
      const latest = env.data && typeof env.data.version === "number" ? String(env.data.version) : undefined;
      throw new SaunaConflictError(id, latest);
    }
    if (res.status === 422 && errorCode(env) === SAUNA_COMPONENT_DEPTH_EXCEEDED) {
      // The server's verdict on nesting (SDL-723) — it sees every Component,
      // the editor may not. A readable refusal, not a transport failure.
      // `data: { depth, limit, previous? }` when the server says; the local
      // limit is only the fallback for an answer that does not.
      const raw = (env as { data?: unknown }).data;
      const info = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
      throw new ComponentDepthError(num(info.depth), num(info.previous), num(info.limit) ?? SAUNA_COMPONENT_MAX_DEPTH);
    }
    throw new Error(
      `${method} ${id} failed: ${res.status} ${res.statusText}${errorMessage(env) ? ` — ${errorMessage(env)}` : ""}`
    );
  }

  function checkWorkspace(doc: PagesServiceDocument | undefined): void {
    if (doc?.workspace_id !== undefined && doc.workspace_id !== opts.workspaceId) {
      throw new SaunaAccessDeniedError(403, "workspace_scope_mismatch");
    }
  }

  async function read(id: SaunaId): Promise<PagesServiceDocument> {
    const headers = { Accept: "application/json", ...(await resolveHeaders(opts.headers)) };
    const res = await fetchImpl(urlFor(id), { method: "GET", headers, cache });
    if (!res.ok) return failOn(res, id, "GET");
    const env = (await res.json()) as Envelope;
    checkWorkspace(env.data);
    if (!env.data) throw new Error(`pages-service provider: empty response for "${id}"`);
    return env.data;
  }

  return {
    async get(id: SaunaId): Promise<SaunaSnapshot> {
      const doc = await read(id);
      const validated = validateSaunaSchema(doc[field]);
      if (!validated.ok) {
        throw new Error(
          `pages-service provider: stored ${field} of "${id}" is not a valid schema: ${validated.error.message}`
        );
      }
      const schema = migrateSaunaSchema(validated.value as SaunaAnySchema);
      return { schema, version: toVersion(doc, id) };
    },

    async put(id: SaunaId, schema: SaunaSchema, options?: SaunaPutOptions): Promise<SaunaPutResult> {
      // Strict on write (SDL-681): an unsafe URL or raw-HTML prop never
      // reaches storage. Reads stay lenient — the renderer drops them.
      const checked = validateSaunaSchema(schema, { mode: "write" });
      if (!checked.ok) {
        throw new Error(
          `pages-service provider: refusing to store "${id}": ${checked.error.message}: ${checked.error.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`
        );
      }
      const expected =
        options?.ifMatch !== undefined
          ? parseVersion(options.ifMatch, id)
          : parseVersion(toVersion(await read(id), id), id);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(await resolveHeaders(opts.headers)),
      };
      const res = await fetchImpl(urlFor(id), {
        method: "PATCH",
        headers,
        body: JSON.stringify({ [field]: schema, version: expected }),
        cache: "no-store",
      });
      if (!res.ok) return failOn(res, id, "PATCH");
      const env = (await res.json()) as Envelope;
      checkWorkspace(env.data);
      return { version: toVersion(env.data, id) };
    },
  };
}
