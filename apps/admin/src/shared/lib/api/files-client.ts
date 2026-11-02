// Files-layer HTTP client (EP-25 Ф8). Talks to files-service through the
// gateway at /api/v1/files/* — the seven routes registered in the gw
// permission registry by SDL-359 (Required: false; ownership is the
// workspace predicate inside files-service, the gateway only routes and
// injects the actor).
//
// Scope (SDL-617 G2, SDL-621): every call carries `workspace_id` and
// nothing else. The gateway scopes these seven routes by it (owner-only)
// and forwards `X-Scope-Workspace-ID`; files-service answers 403 when a
// `workspace_id` in the request disagrees with that header and ignores any
// `project_id` a client sends, so the admin no longer sends one. The scope
// travels as one `FileScope` object, and `smoke:files` fails if any call
// drops the workspace. The same scope names the workspace to apiClient, so
// every call carries this tab's workspace token for it (SDL-613 S6b).
//
// Two things here are deliberately NOT apiClient calls:
//
//   1. The PUT of the bytes goes straight to the object storage on a
//      presigned URL — it must carry no Authorization header at all, and
//      it must not be retried on 401 by the auth refresh path. Sending our
//      session token to Hetzner would leak it; adding any header outside
//      the signed set breaks the signature.
//   2. That same PUT uses XMLHttpRequest rather than fetch, because the
//      library needs upload progress and `fetch` still has no upload
//      progress event. This is the one place in the admin where XHR is the
//      right tool, not legacy.
//
// The three-step contract (Ф3): upload-url → PUT → complete. Step 1 may
// answer `deduplicated: true` with no upload_url — the workspace already has
// those bytes confirmed, and the caller must skip straight to using the
// returned file.

import { apiClient } from "./client";
import type { ApiResponseWithMeta, Meta } from "./types";

/** A file row as files-service serialises it. `storage_key` is never exposed. */
export interface StoredFile {
  id: string;
  project_id: string;
  checksum: string;
  size_bytes: number;
  mime: string;
  filename?: string | null;
  width?: number | null;
  height?: number | null;
  /** `pending` until step 3 confirms the bytes, then `ready`; `deleted` after soft delete. */
  status: "pending" | "ready" | "deleted";
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

/** One row of the reverse link index — what would break if the file went away. */
export interface FileLink {
  file_id: string;
  record_id: string;
  collection: string;
  field: string;
  created_at: string;
  /**
   * SDL-649: `live` — the file is in the record's current body; `history` —
   * only in its revisions (pages-service keeps a file taken while a revision
   * lives). Absent on rows written before the column existed: treat as live.
   */
  source?: "live" | "history";
}

/** GET /v1/files/:id/links — the same shape as the data of a 409 file_in_use. */
export interface FileLinksData {
  links: FileLink[];
  links_count: number;
}

/** How one place came out of a replace (SDL-651 `ReplaceUsage`). */
export type ReplaceUsageStatus = "replaced" | "failed" | "skipped";

/** One live place the replace went through: its link plus the outcome. */
export interface ReplaceUsage {
  collection: string;
  record_id: string;
  field: string;
  source?: "live" | "history";
  status: ReplaceUsageStatus;
  /**
   * Why a place was not replaced: the place owner's code as is
   * (`field_value_changed`, `version_conflict`, `replacement_kind_mismatch`,
   * …) or the orchestrator's own (`deadline_exceeded`, `upstream_*`).
   */
  code?: string;
  message?: string;
  version?: number;
  revision?: number;
}

/**
 * POST /v1/files/:id/replace — 200 whenever validation passed; a partial
 * success is visible per place and in the counters. The original file is
 * never deleted by it, and a repeat is safe (already replaced = replaced).
 */
export interface ReplaceFileResult {
  file_id: string;
  with: string;
  replaced: number;
  failed: number;
  skipped: number;
  usages: ReplaceUsage[];
}

/**
 * Where a files call is aimed: the workspace, which the gateway and
 * files-service check the actor's scope against.
 */
export interface FileScope {
  workspace_id: string;
}

/** A scope only when the workspace is known — callers gate their queries on it. */
export function fileScope(
  workspaceId: string | null | undefined
): FileScope | null {
  return workspaceId ? { workspace_id: workspaceId } : null;
}

/** The scope as query parameters, for every route that takes it in the URL. */
export function fileScopeQuery(scope: FileScope): URLSearchParams {
  return new URLSearchParams({ workspace_id: scope.workspace_id });
}

export interface FileListParams extends FileScope {
  page?: number;
  limit?: number;
  search?: string;
}

export interface UploadURLPayload extends FileScope {
  /** SHA-256 of the bytes, hex, 64 chars — the service rejects anything else. */
  checksum: string;
  size_bytes: number;
  mime: string;
  filename?: string;
}

export interface UploadURLResponse {
  deduplicated: boolean;
  file: StoredFile | null;
  upload_url?: string;
  method?: string;
  headers?: Record<string, string>;
  expires_at?: string;
}

export interface CompleteResponse {
  deduplicated: boolean;
  file: StoredFile | null;
}

export interface FilePatchPayload {
  filename?: string | null;
  is_public?: boolean | null;
}

export interface PresignedURL {
  url: string;
  expires_at?: string;
}

export interface Paged<T> {
  data: T[];
  meta: Meta;
}

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

function withQuery(path: string, usp: URLSearchParams): string {
  const s = usp.toString();
  return s ? `${path}?${s}` : path;
}

/** GET /v1/files/usage (files-service SDL-663). */
export interface FilesUsage {
  /** Bytes of ready files against the workspace quota. */
  bytes: { used: number; quota: number };
  /** Pending and ready files against the workspace limit. */
  files: { used: number; limit: number };
  /** Ceiling of one file, bytes. */
  max_file_bytes: number;
}

export const filesApi = {
  /** The workspace's storage usage and limits — the source of every limit the library shows (SDL-666). */
  usage: (scope: FileScope): Promise<FilesUsage> =>
    apiClient.get<FilesUsage>(withQuery("/v1/files/usage", fileScopeQuery(scope)), {
      workspaceId: scope.workspace_id,
    }),

  list: (params: FileListParams): Promise<Paged<StoredFile>> => {
    const usp = fileScopeQuery(params);
    if (params.page !== undefined) usp.append("page", String(params.page));
    if (params.limit !== undefined) usp.append("limit", String(params.limit));
    if (params.search) usp.append("search", params.search);
    return apiClient
      .getEnvelope<StoredFile[]>(withQuery("/v1/files", usp), { workspaceId: params.workspace_id })
      .then(toPaged);
  },

  get: (id: string, scope: FileScope): Promise<StoredFile> =>
    apiClient.get<StoredFile>(withQuery(`/v1/files/${id}`, fileScopeQuery(scope)), {
      workspaceId: scope.workspace_id,
    }),

  uploadUrl: (payload: UploadURLPayload): Promise<UploadURLResponse> =>
    apiClient.post<UploadURLResponse>("/v1/files/upload-url", payload, {
      workspaceId: payload.workspace_id,
    }),

  /** Step 3. Carries no body — the truth about the bytes comes from storage. */
  complete: (id: string, scope: FileScope): Promise<CompleteResponse> =>
    apiClient.post<CompleteResponse>(
      withQuery(`/v1/files/${id}/complete`, fileScopeQuery(scope)),
      {},
      { workspaceId: scope.workspace_id }
    ),

  patch: (
    id: string,
    scope: FileScope,
    payload: FilePatchPayload
  ): Promise<StoredFile> =>
    apiClient.patch<StoredFile>(
      withQuery(`/v1/files/${id}`, fileScopeQuery(scope)),
      payload,
      { workspaceId: scope.workspace_id }
    ),

  /**
   * Soft delete. Without `force` the service answers 409 `file_in_use` and
   * lists the records that reference the file — that is a UI state (the
   * confirm dialog), not an error to swallow. With `force` the same call
   * deletes and reports how many links it broke.
   */
  remove: (
    id: string,
    scope: FileScope,
    force = false
  ): Promise<{ id: string; status: string; links_broken: number }> => {
    const usp = fileScopeQuery(scope);
    if (force) usp.append("force", "true");
    return apiClient.delete<{ id: string; status: string; links_broken: number }>(
      withQuery(`/v1/files/${id}`, usp),
      { workspaceId: scope.workspace_id }
    );
  },

  /** Where the file is used (SDL-649): live links first, then history. */
  links: (id: string, scope: FileScope): Promise<FileLinksData> =>
    apiClient.get<FileLinksData>(
      withQuery(`/v1/files/${id}/links`, fileScopeQuery(scope)),
      { workspaceId: scope.workspace_id }
    ),

  /**
   * Replace `id` with `withId` in every place that uses it NOW (SDL-651):
   * files-service walks the live links and asks each owner — collections for
   * a record's field, pages for a page or block body — to swap the value
   * under its own version check. History (old revisions) is not rewritten.
   * One call, sequential inside the service under a ~20 s budget; places it
   * did not reach come back `skipped`, and calling again finishes them.
   */
  replace: (id: string, scope: FileScope, withId: string): Promise<ReplaceFileResult> =>
    apiClient.post<ReplaceFileResult>(
      withQuery(`/v1/files/${id}/replace`, fileScopeQuery(scope)),
      { with: withId },
      { workspaceId: scope.workspace_id }
    ),

  /** Signed URL for a private file; a stable public path for a public one. */
  url: (id: string, scope: FileScope): Promise<PresignedURL> =>
    apiClient.get<PresignedURL>(
      withQuery(`/v1/files/${id}/url`, fileScopeQuery(scope)),
      { workspaceId: scope.workspace_id }
    ),
};

// ---- 409 file_in_use -------------------------------------------------

/**
 * Digs the reverse-link list out of a 409.
 *
 * The envelope arrives whole: the client puts the parsed error body on
 * `ApiError.data`, and files-service nests its payload one level deeper
 * ({success, message, error, data:{links, links_count}}). Callers should
 * not have to know that shape — and must not, because a plain 409 from
 * anywhere else has no `links` at all and has to read as "not this case".
 */
export function fileInUseLinks(error: unknown): FileLink[] | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: number }).status;
  if (status !== 409) return null;

  const envelope = (error as { data?: unknown }).data;
  if (!envelope || typeof envelope !== "object") return null;

  const code = (envelope as { error?: unknown }).error;
  if (code !== "file_in_use") return null;

  const payload = (envelope as { data?: unknown }).data;
  if (!payload || typeof payload !== "object") return null;

  const links = (payload as { links?: unknown }).links;
  return Array.isArray(links) ? (links as FileLink[]) : [];
}

// ---- Bytes -----------------------------------------------------------

/** Raised when the caller aborts the PUT (panel closed, cancel pressed). */
export class UploadAbortedError extends Error {
  constructor() {
    super("upload aborted");
    this.name = "UploadAbortedError";
  }
}

/**
 * Raised when the PUT itself fails — a dead connection, a CORS refusal, or
 * a non-2xx from the storage. Distinguishing it from a service error
 * matters to the UI: a failed PUT leaves a live pending row that the
 * garbage collector (Ф5) reclaims on its own, so the right copy is "the
 * upload broke, try again", not "the file is corrupt".
 */
export class UploadTransferError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "UploadTransferError";
  }
}

/**
 * Raised when the PUT goes quiet (SDL-780): the body stopped draining
 * (`stage: "stall"`) or the body left whole and the storage never answered
 * (`stage: "response"`). Either way the bytes may already be stored, so
 * the caller asks complete instead of painting the file as refused.
 */
export class UploadTimeoutError extends Error {
  constructor(public stage: "stall" | "response") {
    super(`upload timed out (${stage})`);
    this.name = "UploadTimeoutError";
  }
}

/** No progress event for this long while the body drains → stall. */
export const PUT_STALL_MS = 30_000;
/** Body sent whole, no answer from the storage for this long → give up waiting. */
export const PUT_RESPONSE_MS = 20_000;

export interface PutBytesOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body: Blob;
  /** 0..1, called as the browser drains the body. */
  onProgress?: (fraction: number) => void;
  /** The whole body left the browser; the storage has not answered yet. */
  onSent?: () => void;
  signal?: AbortSignal;
  /** Watchdog on progress events; 0 disables. Default PUT_STALL_MS. */
  stallMs?: number;
  /** Ceiling on the storage's answer after onSent; 0 disables. Default PUT_RESPONSE_MS. */
  responseMs?: number;
}

/**
 * PUTs the bytes to the presigned URL.
 *
 * Sends exactly the headers the service handed back — the signature covers
 * the method, the Content-Type and the Content-Length, so an extra or
 * missing header is a 403 from the storage, not a warning.
 *
 * Never waits forever (SDL-780): a progress watchdog and a ceiling on the
 * storage's answer both end in `UploadTimeoutError`.
 */
export function putBytes(options: PutBytesOptions): Promise<void> {
  const {
    url,
    method = "PUT",
    headers = {},
    body,
    onProgress,
    onSent,
    signal,
    stallMs = PUT_STALL_MS,
    responseMs = PUT_RESPONSE_MS,
  } = options;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadAbortedError());
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);

    for (const [name, value] of Object.entries(headers)) {
      // Content-Length is set by the browser from the body and assigning it
      // is a no-op that some engines log as an error. Everything else the
      // signature covers must go on the wire verbatim.
      if (name.toLowerCase() === "content-length") continue;
      xhr.setRequestHeader(name, value);
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const arm = (ms: number, stage: "stall" | "response") => {
      clearTimer();
      if (ms <= 0) return;
      timer = setTimeout(() => {
        finish(() => reject(new UploadTimeoutError(stage)));
        xhr.abort();
      }, ms);
    };

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort);

    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimer();
      signal?.removeEventListener("abort", onAbort);
      settle();
    };

    // Listening on xhr.upload is what makes the watchdog possible; it is
    // always on now, so the request always has upload listeners.
    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (settled) return;
      arm(stallMs, "stall");
      if (!onProgress || !e.lengthComputable || e.total === 0) return;
      onProgress(Math.min(1, e.loaded / e.total));
    };

    xhr.upload.onload = () => {
      if (settled) return;
      onProgress?.(1);
      onSent?.();
      arm(responseMs, "response");
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        finish(() => {
          onProgress?.(1);
          resolve();
        });
        return;
      }
      finish(() => reject(new UploadTransferError(`storage answered ${xhr.status}`, xhr.status)));
    };

    xhr.onerror = () => {
      // Status 0 with no response is what a CORS refusal and a dropped
      // connection both look like from script — they are indistinguishable
      // by design, so the message stays generic.
      finish(() => reject(new UploadTransferError("network error during upload", 0)));
    };

    xhr.onabort = () => {
      finish(() => reject(new UploadAbortedError()));
    };

    arm(stallMs, "stall");
    xhr.send(body);
  });
}

/** SHA-256 of a blob as lowercase hex — the checksum format step 1 demands. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
