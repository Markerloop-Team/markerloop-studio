// The mock Markerloop gateway: answers the `/api/v1/*` calls of the admin
// with the same envelopes, status codes and error codes as the real
// services (`{success, data, meta}`, `{success:false, error, message, data}`),
// against the per-session state in ./store. Mounted by
// src/app/api/v1/[...path]/route.ts.

import { currentPolicyEdition } from "@/entities/policy/model/edition";
import { readPolicyFlags } from "@/shared/config/product-features";
import { BASE_PATH } from "../config";
import { renderArt } from "./art";
import { DEMO_USER_ID, DEMO_WORKSPACE_ID, type DemoFile, type DemoState, type Json } from "./seed";
import {
  MAX_UPLOAD_BYTES,
  newSessionId,
  peekSessionFile,
  registerUpload,
  seedArtFor,
  seedSnapshot,
  stateFor,
  uploadOwner,
} from "./store";

/* ------------------------------------------------------------ responses */

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function requestId(): string {
  return `demo-${Math.random().toString(36).slice(2, 10)}`;
}

function ok(data: unknown, status = 200, meta?: unknown): Response {
  const body = meta === undefined ? { success: true, data } : { success: true, data, meta };
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, "X-Request-Id": requestId() } });
}

function fail(status: number, error: string, message: string, data?: unknown): Response {
  return new Response(JSON.stringify({ success: false, error, message, ...(data === undefined ? {} : { data }) }), {
    status,
    headers: { ...JSON_HEADERS, "X-Request-Id": requestId() },
  });
}

const notFound = (what = "resource") => fail(404, "not_found", `${what} not found`);
const noContent = () => new Response(null, { status: 204, headers: { "X-Request-Id": requestId() } });

/* -------------------------------------------------------------- tokens */

type Claims = { user_id: string; sid: string; exp: number; iat: number; typ: string; wsid?: string; wsr?: string; username?: string; email?: string };

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sign(claims: Claims): string {
  return `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}.demo`;
}

function readToken(token: string | null | undefined): Claims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Claims;
    if (typeof claims.sid !== "string" || typeof claims.exp !== "number") return null;
    return claims;
  } catch {
    return null;
  }
}

const ACCESS_TTL = 60 * 60; // 1 h
const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days
const WS_TTL = 15 * 60;

function issuePair(sid: string, user: Json) {
  const now = Math.floor(Date.now() / 1000);
  const base = { user_id: DEMO_USER_ID, sid, iat: now, username: String(user.username), email: String(user.email) };
  return {
    access_token: sign({ ...base, typ: "access", exp: now + ACCESS_TTL }),
    refresh_token: sign({ ...base, typ: "refresh", exp: now + REFRESH_TTL }),
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_expires_in: REFRESH_TTL,
  };
}

/* ---------------------------------------------------------------- utils */

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(state: DemoState, group: number): string {
  state.seq += 1;
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `${group.toString(16).padStart(8, "0")}-${rand}-4000-8000-${state.seq.toString(16).padStart(12, "0")}`;
}

async function readJson(req: Request): Promise<Json> {
  try {
    const text = await req.text();
    if (!text) return {};
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Json) : {};
  } catch {
    return {};
  }
}

function paged<T>(items: T[], url: URL, defaultLimit = 20): Response {
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || defaultLimit));
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const total = items.length;
  const slice = items.slice((page - 1) * limit, page * limit);
  return ok(slice, 200, { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) });
}

function originOf(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost";
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

function demoApi(req: Request): string {
  return `${originOf(req)}${BASE_PATH}/api/v1/__demo`;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string") return (value as { text: string }).text;
  return "";
}

/* ------------------------------------------------------------ the user */

function currentUser(state: DemoState): Json {
  if (!state.user.policy_accepted_version) {
    state.user.policy_accepted_version = currentPolicyEdition(readPolicyFlags()).version || null;
  }
  return state.user;
}

/* ------------------------------------------------------------ records */

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return textOf(a).localeCompare(textOf(b), "en", { numeric: true, sensitivity: "base" });
}

function matchClause(value: unknown, op: string, raw: string): boolean {
  const asNum = Number(raw);
  const v = typeof value === "object" && value !== null && !Array.isArray(value) ? textOf(value) : value;
  switch (op) {
    case "eq":
      if (typeof v === "boolean") return String(v) === raw;
      if (typeof v === "number") return v === asNum;
      return textOf(v) === raw;
    case "ne":
      return !matchClause(value, "eq", raw);
    case "gt":
      return typeof v === "number" ? v > asNum : textOf(v) > raw;
    case "gte":
      return typeof v === "number" ? v >= asNum : textOf(v) >= raw;
    case "lt":
      return typeof v === "number" ? v < asNum : textOf(v) < raw;
    case "lte":
      return typeof v === "number" ? v <= asNum : textOf(v) <= raw;
    case "in":
      return raw.split(",").map((s) => s.trim()).includes(textOf(v));
    case "like":
      return textOf(v).toLowerCase().includes(raw.toLowerCase().replace(/%/g, ""));
    case "null":
      return (v === null || v === undefined || v === "") === (raw === "true");
    default:
      return true;
  }
}

function listRecords(state: DemoState, url: URL, collectionId: string): Json[] {
  let rows = state.records.filter((r) => r.collection_id === collectionId);
  const search = url.searchParams.get("search")?.trim().toLowerCase();
  if (search) {
    rows = rows.filter((r) => Object.values(r.data as Json).some((v) => textOf(v).toLowerCase().includes(search)));
  }
  for (const [key, value] of url.searchParams) {
    const m = /^filter\[([a-z][a-z0-9_]*)\]\[([a-z]+)\]$/.exec(key);
    if (!m) continue;
    const [, field, op] = m;
    rows = rows.filter((r) => matchClause((r.data as Json)[field!], op!, value));
  }
  const sortBy = url.searchParams.get("sort_by") || "created_at";
  const dir = url.searchParams.get("sort_order") === "asc" ? 1 : -1;
  const pick = (r: Json) => (sortBy in r && !(sortBy in (r.data as Json)) ? r[sortBy] : (r.data as Json)[sortBy]);
  rows = [...rows].sort((a, b) => dir * compare(pick(a), pick(b)));
  return rows;
}

/* --------------------------------------------------------------- pages */

type Doc = { nodes?: Record<string, { type?: string; props?: Json }> };

function refsIn(doc: unknown): string[] {
  const nodes = (doc as Doc | null)?.nodes;
  if (!nodes) return [];
  const ids: string[] = [];
  for (const node of Object.values(nodes)) {
    if (node?.type === "Ref" && typeof node.props?.blockId === "string") ids.push(node.props.blockId);
  }
  return ids;
}

function blockUsage(state: DemoState, blockId: string) {
  const pages = state.pages
    .filter((p) => refsIn(p.body).includes(blockId))
    .map((p) => {
      const route = state.routes.find((r) => r.id === p.route_id);
      return { id: String(p.id), route_id: String(p.route_id), path: String(route?.path ?? ""), title: String(route?.title ?? p.label) };
    });
  const blocks = state.blocks
    .filter((b) => b.id !== blockId && refsIn(b.schema).includes(blockId))
    .map((b) => ({ id: String(b.id), name: String(b.name) }));
  return { pages, blocks, count: pages.length + blocks.length };
}

function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t.startsWith("/") || /[:{\s]/.test(t)) return null;
  if (t.length === 1) return t;
  const cut = t.replace(/\/+$/, "");
  return cut === "" ? "/" : cut;
}

function routeView(route: Json): Json {
  return route;
}

function markRouteChanged(state: DemoState, routeId: unknown): void {
  const route = state.routes.find((r) => r.id === routeId);
  if (route && route.status === "published") route.has_unpublished_changes = true;
}

function revisionView(pageIdValue: string, rev: DemoState["pageRevisions"][string][number], withBody: boolean): Json {
  return {
    id: `${pageIdValue.slice(0, 24)}${rev.n.toString(16).padStart(12, "0")}`,
    workspace_id: DEMO_WORKSPACE_ID,
    page_id: pageIdValue,
    revision_number: rev.n,
    body_snapshot: withBody ? rev.body : null,
    author_user_id: rev.author,
    note: rev.note,
    created_at: rev.created_at,
  };
}

function appendRevision(list: DemoState["pageRevisions"][string], body: Json, note = ""): void {
  const last = list[list.length - 1];
  const now = Date.now();
  // pages-service squashes edits of one author within 60 s into one row.
  if (last && note === "" && last.note === "" && now - Date.parse(last.created_at) < 60_000 && last.author === DEMO_USER_ID) {
    last.body = body;
    last.created_at = new Date(now).toISOString();
    return;
  }
  list.push({ n: (last?.n ?? 0) + 1, body, note, created_at: new Date(now).toISOString(), author: DEMO_USER_ID });
}

/* ---------------------------------------------------------------- files */

function fileView(f: DemoFile): Json {
  const { art: _a, bytes: _b, ...rest } = f;
  void _a;
  void _b;
  return { ...rest, project_id: DEMO_WORKSPACE_ID };
}

function fileLinks(state: DemoState, id: string): Json[] {
  const links: Json[] = [];
  const fieldsByCollection = new Map<string, Json[]>();
  for (const f of state.fields) {
    if (f.type !== "image") continue;
    const list = fieldsByCollection.get(String(f.collection_id)) ?? [];
    list.push(f);
    fieldsByCollection.set(String(f.collection_id), list);
  }
  for (const r of state.records) {
    for (const f of fieldsByCollection.get(String(r.collection_id)) ?? []) {
      if ((r.data as Json)[String(f.key)] === id) {
        const c = state.collections.find((x) => x.id === r.collection_id);
        links.push({ file_id: id, record_id: r.id, collection: c?.key ?? "", field: f.key, created_at: r.updated_at, source: "live" });
      }
    }
  }
  return links;
}

/* -------------------------------------------------------------- router */

type Ctx = { req: Request; url: URL; seg: string[]; method: string; state: DemoState; sid: string };

const PUBLIC_PREFIXES = ["auth", "__demo", "data", "invites"];

export async function handleDemoApi(req: Request, segments: string[]): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const seg = segments.map((s) => decodeURIComponent(s));
  // `/api/v1/<seg...>` — the route handler hands over everything after `v1`.
  const head = seg[0] ?? "";

  try {
    if (head === "__demo") return await demoAssets(req, seg, method);
    if (head === "auth") return await auth(req, url, seg, method);
    if (head === "data") return await dataPlane(url, seg);
    if (head === "health") return ok({ status: "ok", mode: "demo" });

    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const claims = readToken(bearer);
    if (!claims) return fail(401, "unauthorized", "Sign in to continue");
    if (claims.exp * 1000 < Date.now()) return fail(401, "token_expired", "The session token has expired");
    if (claims.typ === "refresh") return fail(401, "unauthorized", "A refresh token cannot call the API");

    const ctx: Ctx = { req, url, seg, method, state: stateFor(claims.sid), sid: claims.sid };
    if (!PUBLIC_PREFIXES.includes(head)) {
      // Workspace scoping as the gateway does it: a foreign workspace is 403.
      const ws = url.searchParams.get("workspace_id");
      if (ws && !ctx.state.workspaces.some((w) => w.id === ws)) return fail(403, "forbidden", "Not a member of this workspace");
    }
    switch (head) {
      case "users":
        return await users(ctx);
      case "workspaces":
        return await workspaces(ctx);
      case "collections":
        return await collections(ctx);
      case "records":
        return await records(ctx);
      case "files":
        return await files(ctx);
      case "pages":
        return await pages(ctx);
      case "oauth":
        return seg[1] === "grants" && method === "GET" ? ok([]) : fail(404, "not_found", "Not available in the demo");
      case "external-accounts":
        return method === "GET" ? ok([]) : fail(400, "demo_readonly", "Linking accounts is not available in the demo");
      case "invites":
        return fail(404, "invite_not_found", "Invitations are not available in the demo");
      case "policy-acceptances":
        return seg[1] === "summary"
          ? ok({ editions: [{ version: String(currentUser(ctx.state).policy_accepted_version ?? ""), users: 3 }], never_accepted: 0, total_users: 3 })
          : ok([], 200, { page: 1, limit: 50, total: 0, total_pages: 1 });
      case "dictionary":
        return ok([], 200, { page: 1, limit: 50, total: 0, total_pages: 1 });
      case "roles":
      case "permissions":
        return method === "GET" ? ok([], 200, { page: 1, limit: 50, total: 0, total_pages: 1 }) : fail(403, "forbidden", "Platform administration is not part of the demo");
      default:
        return fail(404, "not_found", `No such route in the demo backend: /v1/${seg.join("/")}`);
    }
  } catch (error) {
    console.error("[demo-api]", method, url.pathname, error);
    return fail(500, "internal", "The demo backend failed to answer this request");
  }
}

/* ----------------------------------------------------------------- auth */

async function auth(req: Request, url: URL, seg: string[], method: string): Promise<Response> {
  const action = seg.slice(1).join("/");
  if (method === "POST" && (action === "login" || action === "register" || action === "google/callback" || action === "telegram/login")) {
    const body = await readJson(req);
    const sid = newSessionId();
    const state = stateFor(sid);
    const typed = typeof body.username === "string" ? body.username.trim() : "";
    if (typed && /^[A-Za-z0-9._@-]{2,64}$/.test(typed) && action !== "login") {
      // A sign-up keeps the name the visitor typed; a sign-in is always the demo owner.
      state.user.username = typed.includes("@") ? typed.split("@")[0] : typed;
    }
    currentUser(state);
    return ok(issuePair(sid, state.user), action === "register" ? 201 : 200);
  }
  if (method === "POST" && action === "refresh") {
    const body = await readJson(req);
    const claims = readToken(typeof body.refresh_token === "string" ? body.refresh_token : null);
    if (!claims || claims.typ !== "refresh" || claims.exp * 1000 < Date.now()) return fail(401, "invalid_refresh_token", "Session expired");
    return ok(issuePair(claims.sid, stateFor(claims.sid).user));
  }
  if (method === "POST" && action === "token/workspace") {
    const claims = readToken(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
    if (!claims || claims.exp * 1000 < Date.now()) return fail(401, "unauthorized", "Sign in to continue");
    const body = await readJson(req);
    const state = stateFor(claims.sid);
    const ws = state.workspaces.find((w) => w.id === body.workspace_id);
    if (!ws) return fail(403, "not_a_member", "Not a member of this workspace");
    const now = Math.floor(Date.now() / 1000);
    const token = sign({ user_id: DEMO_USER_ID, sid: claims.sid, typ: "workspace", iat: now, exp: now + WS_TTL, wsid: String(ws.id), wsr: "owner" });
    return ok({ access_token: token, expires_in: WS_TTL, workspace_id: ws.id, workspace_role: "owner" });
  }
  if (method === "POST" && action === "logout") return ok({ message: "Signed out" });
  if (method === "GET" && action === "google") {
    return fail(503, "provider_unavailable", "Google sign-in is switched off in the demo — use the form with any name and password.");
  }
  if (method === "POST" && action === "telegram/login-request") {
    return fail(404, "not_found", "Telegram sign-in is not available in the demo");
  }
  if (method === "GET" && action === "verify-email") return ok({ message: "Email verified (demo)" });
  if (method === "POST" && ["forgot-password", "reset-password", "resend-verification", "request-email-verification"].includes(action)) {
    return ok({ message: "Done. In the demo no email is sent." });
  }
  void url;
  return fail(404, "not_found", `No such auth route in the demo: ${action}`);
}

/* ---------------------------------------------------------------- users */

async function users({ req, seg, method, state }: Ctx): Promise<Response> {
  if (seg[1] === "my") {
    if (seg[2] === "access") return ok({ roles: ["user"], permissions: [] });
    if (method === "GET") return ok(currentUser(state));
    if (method === "PUT" || method === "PATCH") {
      const body = await readJson(req);
      for (const key of ["username", "first_name", "last_name", "display_name", "policy_accepted_version"]) {
        if (key in body) state.user[key] = body[key];
      }
      if ("policy_accepted_version" in body) state.user.policy_accepted_at = nowIso();
      state.user.updated_at = nowIso();
      return ok(state.user);
    }
    if (method === "DELETE") return fail(400, "demo_readonly", "Deleting the demo account is switched off");
  }
  if (seg[2] === "policy-acceptances") {
    return ok([
      { id: 1, user_id: DEMO_USER_ID, version: String(currentUser(state).policy_accepted_version ?? ""), accepted_at: state.user.policy_accepted_at, ip: null, user_agent: null, source: "signup" },
    ]);
  }
  if (method === "GET" && seg.length === 1) return ok({ users: [currentUser(state)], count: 1, total: 1, page: 1 });
  if (method === "GET" && seg.length === 2) {
    // Profiles of workspace members (names on journals and component rows).
    if (seg[1] === DEMO_USER_ID) return ok(currentUser(state));
    const m = state.members.find((x) => x.user_id === seg[1]);
    if (m) return ok({ id: m.user_id, username: m.username, email: m.email, email_verified: true, email_verified_at: m.created_at, created_at: m.created_at, updated_at: m.created_at });
    return notFound("user");
  }
  return fail(403, "forbidden", "Platform administration is not part of the demo");
}

/* ------------------------------------------------------------ workspaces */

function wsUsage(state: DemoState, id: string): Json {
  const collections = state.collections.filter((c) => c.project_id === id);
  const records = state.records.filter((r) => r.project_id === id).length;
  return {
    workspaces: { used: state.workspaces.length, limit: 3 },
    collections: { used: collections.length, limit: 50 },
    records: { used: records, limit: 50000, visitor_limit: 45000 },
    record_max_bytes: 262144,
  };
}

async function workspaces({ req, url, seg, method, state }: Ctx): Promise<Response> {
  const id = seg[1];
  if (!id) {
    if (method === "GET") return ok(url.searchParams.get("state") === "deleted" ? [] : state.workspaces);
    if (method === "POST") {
      const body = await readJson(req);
      const name = String(body.name ?? "").trim() || "New workspace";
      const slug = String(body.slug ?? "").trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `ws-${state.seq}`;
      const ws = { id: nextId(state, 0x5eed0002), name, owner_user_id: DEMO_USER_ID, slug, billing_plan: "free", is_personal: false, created_at: nowIso(), updated_at: nowIso() };
      state.workspaces.push(ws);
      return ok(ws, 201);
    }
  }
  if (id === "name-check") {
    const slug = String(url.searchParams.get("slug") ?? "").toLowerCase();
    const status = !/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$/.test(slug)
      ? "invalid"
      : ["admin", "api", "www", "app"].includes(slug)
        ? "reserved"
        : state.workspaces.some((w) => w.slug === slug)
          ? "taken"
          : "available";
    return ok({ slug, status });
  }
  const ws = state.workspaces.find((w) => w.id === id);
  if (!ws) return fail(403, "forbidden", "Not a member of this workspace");
  const sub = seg[2];
  if (!sub) {
    if (method === "GET") return ok(ws);
    if (method === "PATCH") {
      const body = await readJson(req);
      if (typeof body.name === "string" && body.name.trim()) ws.name = body.name.trim();
      ws.updated_at = nowIso();
      return ok(ws);
    }
    if (method === "DELETE") {
      if (ws.id === DEMO_WORKSPACE_ID) return fail(400, "demo_readonly", "The demo workspace cannot be deleted — try it on one you created.");
      state.workspaces = state.workspaces.filter((w) => w !== ws);
      return noContent();
    }
  }
  if (sub === "usage") return ok(wsUsage(state, String(ws.id)));
  if (sub === "members") {
    if (method === "GET") return ok(ws.id === DEMO_WORKSPACE_ID ? state.members : state.members.filter((m) => m.user_id === DEMO_USER_ID).map((m) => ({ ...m, workspace_id: ws.id })));
    return fail(400, "demo_readonly", "Changing members is switched off in the demo");
  }
  if (sub === "invites") {
    if (method === "GET") return ok(ws.id === DEMO_WORKSPACE_ID ? state.invites : []);
    if (method === "POST" && !seg[3]) {
      const body = await readJson(req);
      const email = String(body.email ?? "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, "invalid_email", "Enter a valid email address");
      const invite = { id: nextId(state, 0x5eed000b), email, invited_by: DEMO_USER_ID, created_at: nowIso(), last_sent_at: nowIso(), expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), status: "valid", locale: "en" };
      state.invites.unshift(invite);
      return ok({ invite, accept_url: `${originOf(req)}${BASE_PATH}/invite#token=demo`, email_status: "not_sent" }, 201);
    }
    if (method === "POST" && seg[4] === "resend") {
      const invite = state.invites.find((i) => i.id === seg[3]);
      if (!invite) return notFound("invite");
      invite.last_sent_at = nowIso();
      return ok({ invite, accept_url: `${originOf(req)}${BASE_PATH}/invite#token=demo`, email_status: "not_sent" });
    }
    if (method === "DELETE") {
      state.invites = state.invites.filter((i) => i.id !== seg[3]);
      return noContent();
    }
  }
  if (sub === "billing") {
    if (seg[3]) return fail(404, "billing_disabled", "Payments are switched off in the demo");
    return ok({
      plan: ws.billing_plan === "pro" ? "pro" : "free",
      subscription_status: ws.billing_plan === "pro" ? "active" : "none",
      period: ws.billing_plan === "pro" ? "year" : "",
      can_pay: true,
      checkout_enabled: false,
      environment: "sandbox",
      client_token: "",
      pending_checkout: null,
      cancel_at: "",
      grace_until: "",
      current_period_end: ws.billing_plan === "pro" ? new Date(Date.now() + 200 * 864e5).toISOString() : "",
    });
  }
  if (sub === "roles") {
    if (method === "GET") return ok(state.projectRoles);
    return fail(400, "demo_readonly", "Roles are read-only in the demo");
  }
  if (sub === "tokens") {
    if (method === "GET") return ok(state.tokens);
    if (method === "POST" && !seg[3]) {
      const body = await readJson(req);
      const token = { id: nextId(state, 0x5eed000c), project_id: ws.id, name: String(body.name ?? "Token"), prefix: "mlk_demo_" + Math.random().toString(36).slice(2, 5), role_id: String(body.role_id ?? ""), created_by: DEMO_USER_ID, expires_at: body.expires_at ?? null, revoked_at: null, rotated_from: null, last_used_at: null, created_at: nowIso() };
      state.tokens.unshift(token);
      return ok({ token: `${token.prefix}_${"x".repeat(24)}_demo`, access_token: token }, 201);
    }
    if (method === "DELETE") {
      const t = state.tokens.find((x) => x.id === seg[3]);
      if (t) t.revoked_at = nowIso();
      return noContent();
    }
    if (method === "POST" && seg[4] === "rotate") return fail(400, "demo_readonly", "Rotating tokens is switched off in the demo");
  }
  if (sub === "restore") return ok(ws);
  return notFound();
}

/* ---------------------------------------------------------- collections */

async function collections({ req, url, seg, method, state }: Ctx): Promise<Response> {
  const id = seg[1];
  if (!id) {
    if (method === "GET") {
      const ws = url.searchParams.get("workspace_id");
      let list = state.collections.filter((c) => !ws || c.project_id === ws);
      const search = url.searchParams.get("search")?.toLowerCase();
      if (search) list = list.filter((c) => String(c.name).toLowerCase().includes(search) || String(c.key).includes(search));
      const rows = list.map((c) => ({ ...c, records_count: state.records.filter((r) => r.collection_id === c.id).length }));
      return paged(rows, url, 50);
    }
    if (method === "POST") {
      const body = await readJson(req);
      const key = String(body.key ?? "").trim();
      if (!/^[a-z][a-z0-9_]{0,62}$/.test(key)) return fail(400, "invalid_key", "Key: lower-case letters, digits and _");
      if (state.collections.some((c) => c.key === key && c.project_id === body.workspace_id)) return fail(409, "collection_key_taken", "A collection with this key already exists");
      const c = { id: nextId(state, 0x5eed0004), project_id: String(body.workspace_id ?? DEMO_WORKSPACE_ID), key, name: String(body.name ?? key), is_builtin: false, icon: body.icon ?? null, created_at: nowIso(), updated_at: nowIso() };
      state.collections.push(c);
      return ok(c, 201);
    }
  }
  const c = state.collections.find((x) => x.id === id);
  if (!c) return notFound("collection");
  const sub = seg[2];
  if (!sub) {
    if (method === "GET") return ok(c);
    if (method === "PATCH") {
      const body = await readJson(req);
      if (typeof body.name === "string") c.name = body.name;
      if ("icon" in body) c.icon = body.icon;
      c.updated_at = nowIso();
      return ok(c);
    }
    if (method === "DELETE") {
      state.collections = state.collections.filter((x) => x !== c);
      state.fields = state.fields.filter((f) => f.collection_id !== id);
      state.records = state.records.filter((r) => r.collection_id !== id);
      return noContent();
    }
  }
  if (sub === "fields") {
    const fieldId = seg[3];
    if (!fieldId) {
      if (method === "GET") return ok(state.fields.filter((f) => f.collection_id === id));
      if (method === "POST") {
        const body = await readJson(req);
        const key = String(body.key ?? "").trim();
        if (!/^[a-z][a-z0-9_]{0,62}$/.test(key)) return fail(400, "invalid_key", "Key: lower-case letters, digits and _");
        if (state.fields.some((f) => f.collection_id === id && f.key === key)) return fail(409, "field_key_taken", "A field with this key already exists");
        const f = { id: nextId(state, 0x5eed0005), collection_id: id, key, name: String(body.name ?? key), type: String(body.type ?? "string"), config: (body.config as Json) ?? {}, schema_version: 1, created_at: nowIso(), updated_at: nowIso() };
        state.fields.push(f);
        return ok(f, 201);
      }
    }
    const f = state.fields.find((x) => x.id === fieldId && x.collection_id === id);
    if (!f) return notFound("field");
    if (method === "PATCH") {
      const body = await readJson(req);
      if (typeof body.name === "string") f.name = body.name;
      if (body.config && typeof body.config === "object") f.config = body.config;
      f.updated_at = nowIso();
      return ok(f);
    }
    if (method === "DELETE") {
      state.fields = state.fields.filter((x) => x !== f);
      return noContent();
    }
  }
  if (sub === "grants") {
    const grantId = seg[3];
    if (!grantId && method === "GET") return ok(state.grants.filter((g) => g.collection_id === id));
    if (!grantId && method === "POST") {
      const body = await readJson(req);
      const g = { id: nextId(state, 0x5eed000d), collection_id: id, role_id: String(body.role_id ?? ""), action: String(body.action ?? "read"), fields: Array.isArray(body.fields) ? body.fields : [], created_at: nowIso() };
      state.grants.push(g);
      return ok(g, 201);
    }
    const g = state.grants.find((x) => x.id === grantId);
    if (!g) return notFound("grant");
    if (method === "PATCH") {
      const body = await readJson(req);
      if (Array.isArray(body.fields)) g.fields = body.fields;
      return ok(g);
    }
    if (method === "DELETE") {
      state.grants = state.grants.filter((x) => x !== g);
      return noContent();
    }
  }
  return notFound();
}

async function records({ req, url, seg, method, state }: Ctx): Promise<Response> {
  const id = seg[1];
  if (!id) {
    if (method === "GET") {
      const collectionId = url.searchParams.get("collection_id");
      if (!collectionId) return fail(400, "collection_id_required", "collection_id is required");
      if (!state.collections.some((c) => c.id === collectionId)) return notFound("collection");
      return paged(listRecords(state, url, collectionId), url, 20);
    }
    if (method === "POST") {
      const body = await readJson(req);
      const c = state.collections.find((x) => x.id === body.collection_id);
      if (!c) return notFound("collection");
      const data = (body.data as Json) ?? {};
      const r = { id: nextId(state, 0x5eed0006), project_id: c.project_id, collection_id: c.id, data, schema_version: 1, slug: typeof data.slug === "string" ? data.slug : null, version: 1, created_at: nowIso(), updated_at: nowIso() };
      state.records.push(r);
      return ok(r, 201);
    }
  }
  const r = state.records.find((x) => x.id === id);
  if (!r) return notFound("record");
  if (method === "GET") return ok(r);
  if (method === "PATCH" || method === "PUT") {
    const body = await readJson(req);
    if (typeof body.version === "number" && body.version !== r.version) {
      return fail(409, "version_conflict", "The record was changed by someone else", r);
    }
    r.data = { ...(r.data as Json), ...((body.data as Json) ?? {}) };
    r.slug = typeof (r.data as Json).slug === "string" ? (r.data as Json).slug : null;
    r.version = Number(r.version) + 1;
    r.updated_at = nowIso();
    return ok(r);
  }
  if (method === "DELETE") {
    state.records = state.records.filter((x) => x !== r);
    return noContent();
  }
  return notFound();
}

/* ---------------------------------------------------------------- files */

async function files({ req, url, seg, method, state, sid }: Ctx): Promise<Response> {
  const id = seg[1];
  const live = () => state.files.filter((f) => f.status !== "deleted");
  if (id === "usage") {
    const used = live().reduce((n, f) => n + f.size_bytes, 0);
    return ok({ bytes: { used, quota: 5 * 1024 ** 3 }, files: { used: live().length, limit: 10000 }, max_file_bytes: MAX_UPLOAD_BYTES });
  }
  if (id === "upload-url" && method === "POST") {
    const body = await readJson(req);
    const size = Number(body.size_bytes) || 0;
    if (size > MAX_UPLOAD_BYTES) return fail(413, "file_too_large", `Files up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB in the demo`);
    const dup = live().find((f) => f.checksum === body.checksum && f.status === "ready");
    if (dup) return ok({ deduplicated: true, file: fileView(dup) });
    const fid = nextId(state, 0x5eed0003);
    if (!registerUpload(sid, fid)) return fail(409, "quota_exceeded", "Upload limit of the demo session reached");
    const file: DemoFile = {
      id: fid,
      filename: typeof body.filename === "string" ? body.filename : "upload",
      art: null,
      bytes: null,
      mime: typeof body.mime === "string" ? body.mime : "application/octet-stream",
      size_bytes: size,
      width: null,
      height: null,
      status: "pending",
      is_public: true,
      checksum: String(body.checksum ?? fid),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.files.unshift(file);
    return ok({ deduplicated: false, file: fileView(file), upload_url: `${demoApi(req)}/upload/${fid}`, method: "PUT", headers: { "Content-Type": file.mime }, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
  }
  if (!id) {
    if (method !== "GET") return notFound();
    const search = url.searchParams.get("search")?.toLowerCase();
    const list = live()
      .filter((f) => f.status === "ready")
      .filter((f) => !search || (f.filename ?? "").toLowerCase().includes(search))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map(fileView);
    return paged(list, url, 24);
  }
  const file = state.files.find((f) => f.id === id);
  if (!file || file.status === "deleted") return notFound("file");
  const sub = seg[2];
  if (!sub) {
    if (method === "GET") return ok(fileView(file));
    if (method === "PATCH") {
      const body = await readJson(req);
      if ("filename" in body) file.filename = body.filename === null ? "" : String(body.filename);
      if (typeof body.is_public === "boolean") file.is_public = body.is_public;
      file.updated_at = nowIso();
      return ok(fileView(file));
    }
    if (method === "DELETE") {
      const links = fileLinks(state, file.id);
      if (links.length > 0 && url.searchParams.get("force") !== "true") {
        return fail(409, "file_in_use", "The file is used by records", { links, links_count: links.length });
      }
      file.status = "deleted";
      return ok({ id: file.id, status: "deleted", links_broken: links.length });
    }
  }
  if (sub === "complete" && method === "POST") {
    if (!file.bytes && !file.art) return fail(409, "upload_incomplete", "The bytes have not arrived yet");
    file.status = "ready";
    file.updated_at = nowIso();
    return ok({ deduplicated: false, file: fileView(file) });
  }
  if (sub === "url") {
    // As files-service: a public file has the stable relative `/files/<id>`
    // (the admin prefixes the delivery host), a private one a signed absolute URL.
    if (file.is_public) return ok({ url: `/files/${file.id}` });
    const stamp = Date.parse(file.updated_at).toString(36);
    return ok({ url: `${demoApi(req)}/files/${file.id}?sig=${stamp}`, expires_at: new Date(Date.now() + 3600_000).toISOString() });
  }
  if (sub === "links") {
    const links = fileLinks(state, file.id);
    return ok({ links, links_count: links.length });
  }
  if (sub === "replace" && method === "POST") {
    const body = await readJson(req);
    const target = String(body.with ?? "");
    const usages: Json[] = [];
    for (const link of fileLinks(state, file.id)) {
      const r = state.records.find((x) => x.id === link.record_id);
      if (!r) continue;
      (r.data as Json)[String(link.field)] = target;
      r.version = Number(r.version) + 1;
      usages.push({ collection: link.collection, record_id: r.id, field: link.field, source: "live", status: "replaced", version: r.version });
    }
    return ok({ file_id: file.id, with: target, replaced: usages.length, failed: 0, skipped: 0, usages });
  }
  return notFound();
}

/* -------------------------------------------------- demo assets & uploads */

async function demoAssets(req: Request, seg: string[], method: string): Promise<Response> {
  const kind = seg[1];
  const id = seg[2] ?? "";
  if (kind === "upload" && method === "PUT") {
    const sid = uploadOwner(id);
    if (!sid) return new Response("unknown upload", { status: 404 });
    const file = peekSessionFile(sid, id);
    if (!file) return new Response("unknown upload", { status: 404 });
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.byteLength > MAX_UPLOAD_BYTES) return new Response("too large", { status: 413 });
    file.bytes = buf;
    file.size_bytes = buf.byteLength;
    file.mime = req.headers.get("content-type") || file.mime;
    return new Response(null, { status: 200, headers: { ETag: `"${id}"` } });
  }
  if (kind === "files" && (method === "GET" || method === "HEAD")) {
    const owner = uploadOwner(id);
    if (owner) {
      const file = peekSessionFile(owner, id);
      if (file?.bytes) {
        return new Response(method === "HEAD" ? null : (file.bytes as unknown as BodyInit), {
          headers: { "Content-Type": file.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
        });
      }
      if (file?.art) return svg(renderArt(file.art), method);
    }
    const art = seedArtFor(id);
    if (art) return svg(art, method);
    return new Response("not found", { status: 404 });
  }
  return new Response("not found", { status: 404 });
}

function svg(markup: string, method: string): Response {
  return new Response(method === "HEAD" ? null : markup, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/* ----------------------------------------------------------- data plane */

async function dataPlane(url: URL, seg: string[]): Promise<Response> {
  // Anonymous `/v1/data/<workspace>/<collection key>`: the published site's
  // reads. Anonymous visitors have no session, so they read the seed.
  const [, , key] = seg;
  const seed = seedSnapshot();
  const c = seed.collections.find((x) => x.key === key);
  if (!c) return notFound("collection");
  return paged(listRecords(seed, url, String(c.id)), url, 20);
}

/* ---------------------------------------------------------------- pages */

async function pages(ctx: Ctx): Promise<Response> {
  const { seg } = ctx;
  switch (seg[1]) {
    case "usage":
      return ok({ routes: { used: ctx.state.routes.length, limit: 50 } });
    case "routes":
      return routes(ctx);
    case "pages":
      return pageDocs(ctx);
    case "blocks":
      return blocks(ctx);
    case "theme":
      return theme(ctx);
    default:
      return notFound();
  }
}

async function routes({ req, seg, method, state }: Ctx): Promise<Response> {
  const id = seg[2];
  if (!id) {
    if (method === "GET") return ok([...state.routes].sort((a, b) => String(a.path).localeCompare(String(b.path))).map(routeView));
    if (method === "POST") {
      const body = await readJson(req);
      const path = normalizePath(body.path);
      if (!path) return fail(400, "invalid_route_path", "The address must start with / and contain no spaces, : or {");
      if (state.routes.some((r) => r.path === path)) return fail(409, "route_path_taken", "This address is already taken");
      if (state.routes.length >= 50) return fail(409, "quota_exceeded", "Address limit reached", { limit: 50, used: state.routes.length, resource: "routes" });
      const route = { id: nextId(state, 0x5eed0007), workspace_id: DEMO_WORKSPACE_ID, path, title: String(body.title ?? ""), status: "draft", pinned: false, version: 1, created_at: nowIso(), updated_at: nowIso(), published_at: null, has_unpublished_changes: false };
      state.routes.push(route);
      return ok(route, 201);
    }
  }
  const route = state.routes.find((r) => r.id === id);
  if (!route) return notFound("route");
  if (method === "GET") return ok(routeView(route));
  if (method === "PATCH") {
    const body = await readJson(req);
    if (typeof body.version === "number" && body.version !== route.version) {
      return fail(409, "route_version_conflict", "The address was changed by someone else", route);
    }
    if ("path" in body) {
      const path = normalizePath(body.path);
      if (!path) return fail(400, "invalid_route_path", "The address must start with / and contain no spaces, : or {");
      if (path !== route.path && state.routes.some((r) => r.path === path)) return fail(409, "route_path_taken", "This address is already taken");
      route.path = path;
    }
    if (typeof body.title === "string") route.title = body.title;
    if (typeof body.pinned === "boolean") route.pinned = body.pinned;
    if (body.status === "published") {
      route.status = "published";
      route.published_at = nowIso();
      route.has_unpublished_changes = false;
    } else if (body.status === "draft") {
      route.status = "draft";
      route.published_at = null;
      route.has_unpublished_changes = false;
    } else if ("title" in body && route.status === "published") {
      route.has_unpublished_changes = true;
    }
    route.version = Number(route.version) + 1;
    route.updated_at = nowIso();
    return ok(routeView(route));
  }
  if (method === "DELETE") {
    state.routes = state.routes.filter((r) => r !== route);
    const gone = state.pages.filter((p) => p.route_id === id).map((p) => p.id);
    state.pages = state.pages.filter((p) => p.route_id !== id);
    for (const pid of gone) delete state.pageRevisions[String(pid)];
    return noContent();
  }
  return notFound();
}

async function pageDocs({ req, url, seg, method, state }: Ctx): Promise<Response> {
  const id = seg[2];
  if (!id) {
    if (method === "GET") {
      const routeId = url.searchParams.get("route_id");
      return ok(state.pages.filter((p) => !routeId || p.route_id === routeId));
    }
    if (method === "POST") {
      const body = await readJson(req);
      const route = state.routes.find((r) => r.id === body.route_id);
      if (!route) return fail(404, "route_not_found", "No such address");
      if (state.pages.some((p) => p.route_id === route.id)) return fail(409, "page_route_taken", "This address already has a page");
      const page = { id: nextId(state, 0x5eed0008), workspace_id: DEMO_WORKSPACE_ID, route_id: route.id, label: String(body.label ?? route.title), collection_binding: null, body: (body.body as Json) ?? null, version: 1, created_at: nowIso(), updated_at: nowIso() };
      state.pages.push(page);
      state.pageRevisions[page.id] = [{ n: 1, body: page.body as Json, note: "created", created_at: nowIso(), author: DEMO_USER_ID }];
      return ok(page, 201);
    }
  }
  const page = state.pages.find((p) => p.id === id);
  if (!page) return notFound("page");
  const revs = (state.pageRevisions[String(page.id)] ??= []);
  if (seg[3] === "revisions") {
    const n = seg[4] ? Number(seg[4]) : null;
    if (n === null) {
      const limit = Math.min(200, Number(url.searchParams.get("limit")) || 50);
      const offset = Number(url.searchParams.get("offset")) || 0;
      const items = [...revs].reverse().slice(offset, offset + limit).map((r) => revisionView(String(page.id), r, true));
      return ok({ items, total: revs.length, limit, offset });
    }
    const rev = revs.find((r) => r.n === n);
    if (!rev) return notFound("revision");
    if (seg[5] === "restore" && method === "POST") {
      const body = await readJson(req);
      if (typeof body.version === "number" && body.version !== page.version) return fail(409, "page_version_conflict", "The page was changed by someone else", page);
      page.body = structuredClone(rev.body);
      page.version = Number(page.version) + 1;
      page.updated_at = nowIso();
      appendRevision(revs, page.body as Json, `restored from revision ${n}`);
      markRouteChanged(state, page.route_id);
      return ok(page);
    }
    return ok(revisionView(String(page.id), rev, true));
  }
  if (method === "GET") return ok(page);
  if (method === "PATCH") {
    const body = await readJson(req);
    if (typeof body.version === "number" && body.version !== page.version) {
      return fail(409, "page_version_conflict", "The page was changed by someone else", page);
    }
    if ("body" in body) page.body = body.body as Json;
    if (typeof body.label === "string") page.label = body.label;
    page.version = Number(page.version) + 1;
    page.updated_at = nowIso();
    appendRevision(revs, page.body as Json);
    markRouteChanged(state, page.route_id);
    return ok(page);
  }
  if (method === "DELETE") {
    state.pages = state.pages.filter((p) => p !== page);
    return noContent();
  }
  return notFound();
}

function blockRow(state: DemoState, b: Json): Json {
  return { ...b, usage_count: blockUsage(state, String(b.id)).count };
}

async function blocks({ req, url, seg, method, state }: Ctx): Promise<Response> {
  const id = seg[2];
  if (!id) {
    if (method === "GET") return ok(state.blocks.map((b) => blockRow(state, b)));
    if (method === "POST") {
      const body = await readJson(req);
      const name = String(body.name ?? "Component").trim() || "Component";
      const key = typeof body.key === "string" && body.key ? body.key : name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `component_${state.seq}`;
      if (state.blocks.some((b) => b.key === key)) return fail(409, "block_key_taken", "A component with this key already exists");
      const block = { id: nextId(state, 0x5eed0009), workspace_id: DEMO_WORKSPACE_ID, key, name, group: body.group ?? null, schema: body.schema ?? null, version: 1, created_at: nowIso(), updated_at: nowIso(), updated_by: DEMO_USER_ID };
      state.blocks.push(block);
      state.blockRevisions[block.id] = [{ n: 1, body: block.schema as Json, note: "created", created_at: nowIso(), author: DEMO_USER_ID }];
      return ok(blockRow(state, block), 201);
    }
  }
  const block = state.blocks.find((b) => b.id === id);
  if (!block) return notFound("block");
  const revs = (state.blockRevisions[String(block.id)] ??= []);
  if (seg[3] === "revisions") {
    const n = seg[4] ? Number(seg[4]) : null;
    if (n === null) {
      const items = [...revs].reverse().map((r) => ({ id: `${String(block.id).slice(0, 24)}${r.n.toString(16).padStart(12, "0")}`, block_id: block.id, revision_number: r.n, author_user_id: r.author, note: r.note, created_at: r.created_at, schema_snapshot: r.body }));
      return ok({ items, total: revs.length });
    }
    const rev = revs.find((r) => r.n === n);
    if (!rev) return notFound("revision");
    if (seg[5] === "restore" && method === "POST") {
      const body = await readJson(req);
      if (typeof body.version === "number" && body.version !== block.version) return fail(409, "block_version_conflict", "The component was changed by someone else", block);
      block.schema = structuredClone(rev.body);
      block.version = Number(block.version) + 1;
      block.updated_at = nowIso();
      appendRevision(revs, block.schema as Json, `restored from revision ${n}`);
      return ok(blockRow(state, block));
    }
    return ok({ block_id: block.id, revision_number: rev.n, schema_snapshot: rev.body, note: rev.note, created_at: rev.created_at });
  }
  if (method === "GET") return ok({ ...blockRow(state, block), usage: blockUsage(state, String(block.id)) });
  if (method === "PATCH") {
    const body = await readJson(req);
    if (typeof body.version === "number" && body.version !== block.version) {
      return fail(409, "block_version_conflict", "The component was changed by someone else", block);
    }
    if ("schema" in body) {
      block.schema = body.schema as Json;
      appendRevision(revs, block.schema as Json);
      for (const p of state.pages) if (refsIn(p.body).includes(String(block.id))) markRouteChanged(state, p.route_id);
    }
    if (typeof body.name === "string" && body.name.trim()) block.name = body.name.trim();
    if ("group" in body) block.group = body.group === "" ? null : body.group;
    block.version = Number(block.version) + 1;
    block.updated_at = nowIso();
    block.updated_by = DEMO_USER_ID;
    return ok(blockRow(state, block));
  }
  if (method === "DELETE") {
    const usage = blockUsage(state, String(block.id));
    if (usage.count > 0 && url.searchParams.get("force") !== "true") {
      return fail(409, "block_in_use", "The component is used on pages", { usage, usage_count: usage.count });
    }
    state.blocks = state.blocks.filter((b) => b !== block);
    return noContent();
  }
  return notFound();
}

async function theme({ req, seg, method, state }: Ctx): Promise<Response> {
  const sub = seg[2];
  const draft = () => ({ ...state.theme, theme: state.theme.theme });
  if (!sub) {
    if (method === "GET") return ok(draft());
    if (method === "PATCH") {
      const body = await readJson(req);
      const { version, ...patch } = body;
      if (typeof version === "number" && version !== state.theme.version) {
        return fail(409, "theme_version_conflict", "The theme was changed by someone else", draft());
      }
      const next = { ...state.theme.theme } as Json;
      for (const [k, v] of Object.entries(patch)) {
        if (k === "colors" && v && typeof v === "object") next.colors = { ...(next.colors as Json), ...(v as Json) };
        else if (k === "fonts" && v && typeof v === "object") next.fonts = { ...(next.fonts as Json), ...(v as Json) };
        else next[k] = v;
      }
      state.theme.theme = next;
      state.theme.version += 1;
      state.theme.has_unpublished_changes = true;
      state.theme.updated_at = nowIso();
      return ok(draft());
    }
  }
  if (sub === "publish" && method === "POST") {
    const revision = (state.themeRevisions[state.themeRevisions.length - 1]?.revision ?? 0) + 1;
    const row = { revision, theme: structuredClone(state.theme.theme), note: "", author_id: DEMO_USER_ID, created_at: nowIso() };
    state.themeRevisions.push(row);
    state.theme.published_revision = revision;
    state.theme.has_unpublished_changes = false;
    return ok({ ...row, current: true });
  }
  if (sub === "revisions") {
    const n = seg[3] ? Number(seg[3]) : null;
    if (n === null) {
      const items = [...state.themeRevisions].reverse().map((r) => ({ ...r, current: r.revision === state.theme.published_revision }));
      return ok({ items, total: items.length, limit: 50, offset: 0 });
    }
    const rev = state.themeRevisions.find((r) => r.revision === n);
    if (!rev) return notFound("revision");
    if (seg[4] === "restore" && method === "POST") {
      state.theme.theme = structuredClone(rev.theme);
      state.theme.version += 1;
      state.theme.has_unpublished_changes = rev.revision !== state.theme.published_revision;
      state.theme.updated_at = nowIso();
      return ok(draft());
    }
  }
  return notFound();
}
