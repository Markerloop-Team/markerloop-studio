// The Studio's Components over pages-service (SDL-718, EP-145).
//
// `SaunaSaveAsComponentApi` and `SaunaComponentLibraryApi` are what the shell
// needs; this module is the one implementation of both against the service
// as it is, through the gateway with a workspace scope:
//
//   POST  {api}/v1/pages/blocks                       {workspace_id, key, name, schema} → 201 {id, key, …}
//   GET   {api}/v1/pages/blocks?workspace_id=…        → {data: Block[]}
//   GET   {api}/v1/pages/blocks/{id}?workspace_id=…   → {data: Block}
//
// The id is the service's (a UUID it issues on create) — there is no
// "PUT with the client's id" any more: that was an upsert, and an upsert
// keyed by a slug the client invented overwrote a colleague's component
// with the same name. The key is derived from the name
// (`saunaUniqueComponentKey`) against the keys the workspace already has, and
// a key taken in between (409 `block_key_taken`) is retried with the next
// suffix.
//
// No React: the admin wires it into `SaunaStudio` (SDL-719).

import { isSaunaNotFoundError, validateSaunaSchema, type SaunaSchema } from "@markerloop/engine";
import { saunaComponentGroups } from "./group-options";
import { createPagesServiceProvider } from "@markerloop/engine/providers/pages";

import type { SaunaComponentSummary } from "./own-components";
import { saunaCheckComponentName, saunaUniqueComponentKey } from "./save-as-component-copy";
import type { SaunaSaveAsComponentApi } from "./shell";

type Headers = Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);

export type PagesComponentsApiOptions = {
  /** Gateway API prefix, everything before `/v1` (`getApiBaseUrl()` in the admin). */
  apiBaseUrl: string;
  /** The workspace every request is scoped to: `workspace_id` in the query on GET, in the body on POST. */
  workspaceId: string;
  /** Override `globalThis.fetch` (tests, instrumentation). */
  fetch?: typeof globalThis.fetch;
  /** Extra request headers, e.g. `Authorization`. */
  headers?: Headers;
};

/** One Component as pages-service stores it (`models.Block`). */
export type PagesComponentRecord = {
  id: string;
  workspace_id?: string;
  key: string;
  name: string;
  /** The Component's group (pages-service EP-175); null or absent — no group. */
  group?: string | null;
  schema?: unknown;
  version?: number;
  created_at?: string;
  updated_at?: string;
};

export type PagesComponentsApi = {
  /** For `SaunaStudio saveAsComponent`. */
  saveAsComponent: SaunaSaveAsComponentApi;
  /** Every Component of the workspace, for the Insert modal's Components tab. */
  list: () => Promise<readonly SaunaComponentSummary[]>;
  /** One Component's schema by id; `null` when there is no such Component. */
  load: (blockId: string) => Promise<SaunaSchema | null>;
};

/** How many times a create retries a key someone took in between. */
const KEY_TAKEN_RETRIES = 3;

/**
 * A failed Components request. `message` is technical (status, endpoint) —
 * for logs; what a person reads is `saunaSaveComponentErrorText(error)`.
 */
export class PagesComponentsError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  /** Validation issues behind an `invalid_schema` / `invalid_name` refusal. */
  readonly issues: readonly { path: string; message: string }[];
  constructor(
    status: number,
    code: string | undefined,
    message: string,
    issues: readonly { path: string; message: string }[] = []
  ) {
    super(message);
    this.name = "PagesComponentsError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

/** Name guard instead of `instanceof` — the class may come from another bundle. */
export function isPagesComponentsError(e: unknown): e is PagesComponentsError {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "PagesComponentsError";
}

type Envelope = {
  data?: unknown;
  error?: string | { code?: string; message?: string };
  message?: string;
};

async function readEnvelope(res: Response): Promise<Envelope> {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as Envelope;
  } catch {
    return { message: text };
  }
}

function failure(res: Response, env: Envelope, what: string): PagesComponentsError {
  const code = typeof env.error === "string" ? env.error : env.error?.code;
  const detail = env.message ?? (typeof env.error === "object" ? env.error?.message : undefined);
  return new PagesComponentsError(res.status, code, `${what} failed: ${res.status}${detail ? ` — ${detail}` : ""}`);
}

function isRecord(v: unknown): v is PagesComponentRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && r.id.length > 0 && typeof r.key === "string" && typeof r.name === "string";
}

export function createPagesComponentsApi(opts: PagesComponentsApiOptions): PagesComponentsApi {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("createPagesComponentsApi: no `fetch` available");
  if (!opts.workspaceId) throw new Error("createPagesComponentsApi: `workspaceId` is required");

  const base = `${opts.apiBaseUrl.replace(/\/$/, "")}/v1/pages/blocks`;
  const scope = `workspace_id=${encodeURIComponent(opts.workspaceId)}`;
  const headers = async (): Promise<Record<string, string>> => {
    const extra = typeof opts.headers === "function" ? await opts.headers() : opts.headers ?? {};
    return { Accept: "application/json", ...extra };
  };

  const provider = createPagesServiceProvider({
    apiBaseUrl: opts.apiBaseUrl,
    workspaceId: opts.workspaceId,
    kind: "blocks",
    fetch: fetchImpl,
    headers: opts.headers,
  });

  async function listRecords(): Promise<PagesComponentRecord[]> {
    const res = await fetchImpl(`${base}?${scope}`, { method: "GET", headers: await headers(), cache: "no-store" });
    const env = await readEnvelope(res);
    if (!res.ok) throw failure(res, env, "GET /pages/blocks");
    const data = Array.isArray(env.data) ? env.data : [];
    return data.filter(isRecord);
  }

  async function post(key: string, name: string, schema: SaunaSchema, group: string | null): Promise<Response> {
    // `group` only when there is one: an older pages-service ignores the
    // field anyway, and the body of a plain save stays what it was.
    const body = group
      ? { workspace_id: opts.workspaceId, key, name, group, schema }
      : { workspace_id: opts.workspaceId, key, name, schema };
    return fetchImpl(base, {
      method: "POST",
      headers: { ...(await headers()), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  }

  const saveAsComponent: SaunaSaveAsComponentApi = {
    async create({ name: rawName, schema, group: rawGroup }) {
      const group = typeof rawGroup === "string" && rawGroup.trim() ? rawGroup.trim() : null;
      const name = saunaCheckComponentName(rawName);
      if (!name.ok) throw new PagesComponentsError(0, "invalid_name", name.reason, [{ path: "name", message: name.reason }]);
      // Strict on write, like the page provider (SDL-681, SDL-718): a schema
      // with an unsafe prop or a broken parameter never reaches storage.
      const checked = validateSaunaSchema(schema, { mode: "write" });
      if (!checked.ok) {
        throw new PagesComponentsError(
          0,
          "invalid_schema",
          `${checked.error.message}: ${checked.error.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`,
          checked.error.issues
        );
      }

      const taken = new Set((await listRecords()).map((r) => r.key));
      for (let attempt = 0; ; attempt++) {
        const key = saunaUniqueComponentKey(name.name, taken);
        const res = await post(key, name.name, schema, group);
        const env = await readEnvelope(res);
        if (res.ok) {
          // No workspace_id cross-check on the answer (review of !294): the
          // host sets the scope and the gateway verified it, and a refusal
          // AFTER a successful create would leave a Component nobody points
          // at — and the next attempt would mint `<key>-2` beside it.
          if (!isRecord(env.data)) throw failure(res, { message: "the response carries no component id" }, "POST /pages/blocks");
          return { id: env.data.id, key: env.data.key };
        }
        const err = failure(res, env, "POST /pages/blocks");
        if (res.status === 409 && err.code === "block_key_taken" && attempt < KEY_TAKEN_RETRIES) {
          taken.add(key);
          continue;
        }
        throw err;
      }
    },
    async groups() {
      return saunaComponentGroups(await listRecords());
    },
  };

  return {
    saveAsComponent,
    async list() {
      return (await listRecords()).map((r) => ({ id: r.id, name: r.name || r.key, key: r.key }));
    },
    async load(blockId: string) {
      try {
        return (await provider.get(blockId)).schema;
      } catch (e) {
        if (isSaunaNotFoundError(e)) return null;
        throw e;
      }
    },
  };
}
