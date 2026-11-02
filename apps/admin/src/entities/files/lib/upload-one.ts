/**
 * One file through the three-step upload (SDL-780): upload-url → PUT →
 * complete, with an honest answer to «what is it waiting for».
 *
 * Rules, in the order they bite:
 *
 *   - PUT ended in a timeout, a network error or a 5xx → ask complete
 *     anyway: the bytes may have landed, and only the storage knows.
 *   - complete says 400 `upload_missing` → the bytes did not land; PUT once
 *     more to the same signed URL if it lives > 30 s longer, then complete.
 *   - complete fails transiently (network, client timeout, 500/502/503/504)
 *     → one automatic retry after a fixed 2 s (files-service sends
 *     Retry-After: 2 as a header, which apiClient does not expose; the
 *     number is the same). files-service makes complete idempotent and
 *     answers 503 `storage_slow` inside 25 s.
 *   - still failing → `stalled`: the file is not lost, «Retry» calls
 *     complete again on the same id; «Start over» drops the pending row.
 *   - `upload_missing` with a signed URL about to die → `expired`: the bytes
 *     are not there and cannot be sent again on this ticket; «Start over» only.
 *   - `rejected` is kept for final refusals only (content_mismatch,
 *     file_too_large, 413, 415, 409, 507, a 404 on the first complete).
 *
 * Deliberately NOT here: a third retry, a «404 then GET ready» probe.
 * Everything that touches the network is injected so the smoke can drive
 * it with a fake clock.
 */

/** Per-attempt ceiling on complete; above the gateway's own 30 s. */
export const COMPLETE_TIMEOUT_MS = 35_000;
/** Pause before the single automatic retry (the backend's Retry-After: 2). */
export const RETRY_PAUSE_MS = 2_000;
/** A signed URL this close to expiry is not worth a second PUT. */
export const URL_MIN_LIFE_MS = 30_000;

export type UploadStep = "put" | "complete" | "discard";

export interface UploadTicket {
  fileId: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Epoch ms when the signed URL dies; null when the service did not say. */
  expiresAt: number | null;
}

export interface UploadedFile {
  id: string;
}

export interface UploadDeps<F extends UploadedFile> {
  uploadUrl: () => Promise<{
    deduplicated: boolean;
    file: F | null;
    upload_url?: string;
    method?: string;
    headers?: Record<string, string>;
    expires_at?: string;
  }>;
  put: (
    ticket: UploadTicket,
    hooks: { onProgress: (fraction: number) => void; onSent: () => void }
  ) => Promise<void>;
  complete: (fileId: string) => Promise<{ deduplicated: boolean; file: F | null }>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Error telemetry (Sentry in the app). Must not throw. */
  report: (step: UploadStep, error: unknown, extra: Record<string, unknown>) => void;
}

export type UploadEvent =
  | { state: "sending"; percent: number }
  | { state: "storing"; since: number }
  | { state: "checking"; since: number; attempt: number };

export type UploadOutcome<F> =
  | { kind: "done"; file: F | null; deduplicated: boolean }
  | { kind: "stalled"; ticket: UploadTicket; error: unknown }
  /** The bytes never landed and the signed URL is (nearly) dead: Start over only. */
  | { kind: "expired"; ticket: UploadTicket; error: unknown }
  | { kind: "rejected"; error: unknown; ticket?: UploadTicket };

/** Raised by `withTimeout`; reads like an ApiError with status 0. */
export class ClientTimeoutError extends Error {
  status = 0;
  data = { error: "client_timeout" };
  constructor(ms: number) {
    super(`no answer in ${ms} ms`);
    this.name = "ClientTimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = {
    set: setTimeout,
    clear: clearTimeout,
  }
): Promise<T> {
  // Called unbound on purpose: `timers.set(...)` would run the browser's
  // setTimeout with `this === timers` and throw «Illegal invocation» — every
  // complete then failed on the client after a 200 from the server (SDL-780).
  const { set, clear } = timers;
  return new Promise<T>((resolve, reject) => {
    const id = set(() => reject(new ClientTimeoutError(ms)), ms);
    promise.then(
      (v) => {
        clear(id);
        resolve(v);
      },
      (e: unknown) => {
        clear(id);
        reject(e);
      }
    );
  });
}

function statusOf(e: unknown): number | undefined {
  if (!e || typeof e !== "object") return undefined;
  const s = (e as { status?: unknown }).status;
  return typeof s === "number" ? s : undefined;
}

/** The service's machine code: `{error: "upload_missing"}` on the error body. */
export function errorCodeOf(e: unknown): string | undefined {
  if (!e || typeof e !== "object") return undefined;
  const data = (e as { data?: unknown }).data;
  if (!data || typeof data !== "object") return undefined;
  const code = (data as { error?: unknown }).error;
  return typeof code === "string" ? code : undefined;
}

export type CompleteFailure = "transient" | "missing" | "final";

/** What a failed complete means for the row. */
export function classifyCompleteError(e: unknown): CompleteFailure {
  const status = statusOf(e);
  const code = errorCodeOf(e);
  if (code === "upload_missing") return "missing";
  if (code === "client_timeout" || code === "storage_slow" || code === "storage_unavailable") {
    return "transient";
  }
  if (status === undefined || status === 0) return "transient";
  if (status === 500 || status === 502 || status === 503 || status === 504) return "transient";
  return "final";
}

/** A PUT failure after which complete is still worth asking. */
export function putMayHaveLanded(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = (e as { name?: unknown }).name;
  if (name === "UploadTimeoutError") return true;
  if (name === "UploadTransferError") {
    const status = statusOf(e) ?? 0;
    return status === 0 || status >= 500;
  }
  return false;
}

function ticketFrom(step1: {
  file: UploadedFile | null;
  upload_url?: string;
  method?: string;
  headers?: Record<string, string>;
  expires_at?: string;
}): UploadTicket {
  const id = step1.file?.id;
  if (!id || !step1.upload_url) throw new Error("upload-url answered without a file id");
  const parsed = step1.expires_at ? Date.parse(step1.expires_at) : NaN;
  return {
    fileId: id,
    url: step1.upload_url,
    method: step1.method,
    headers: step1.headers,
    expiresAt: Number.isFinite(parsed) ? parsed : null,
  };
}

/** Full run: upload-url, bytes, complete. */
export async function uploadOne<F extends UploadedFile>(
  deps: UploadDeps<F>,
  onEvent: (event: UploadEvent) => void
): Promise<UploadOutcome<F>> {
  const step1 = await deps.uploadUrl();
  if (step1.deduplicated || !step1.upload_url) {
    return { kind: "done", file: step1.file, deduplicated: true };
  }
  const ticket = ticketFrom(step1);
  return finishUpload(deps, ticket, onEvent, { put: true });
}

/**
 * Bytes (optionally) and complete for a ticket already issued. «Retry» calls
 * it with `put: false` — no new upload-url, no new pending row.
 */
export async function finishUpload<F extends UploadedFile>(
  deps: UploadDeps<F>,
  ticket: UploadTicket,
  onEvent: (event: UploadEvent) => void,
  opts: { put: boolean }
): Promise<UploadOutcome<F>> {
  let putsLeft = opts.put ? 2 : 1;
  let mustPut = opts.put;

  const sendBytes = async (): Promise<"sent" | "unknown" | UploadOutcome<F>> => {
    putsLeft -= 1;
    onEvent({ state: "sending", percent: 0 });
    const started = deps.now();
    try {
      await deps.put(ticket, {
        onProgress: (f) => onEvent({ state: "sending", percent: Math.round(f * 100) }),
        onSent: () => onEvent({ state: "storing", since: deps.now() }),
      });
      return "sent";
    } catch (e) {
      // Only the unknown outcomes go to telemetry; a 403/4xx from the
      // storage is a final answer, not an incident.
      if (putMayHaveLanded(e)) {
        deps.report("put", e, { fileId: ticket.fileId, status: statusOf(e), elapsedMs: deps.now() - started });
        return "unknown";
      }
      return { kind: "rejected", error: e, ticket };
    }
  };

  const urlAlive = () =>
    ticket.expiresAt === null || ticket.expiresAt - deps.now() > URL_MIN_LIFE_MS;

  let completeAttempts = 0;
  let lastError: unknown = null;

  for (;;) {
    if (mustPut) {
      const sent = await sendBytes();
      if (typeof sent === "object") return sent;
      mustPut = false;
    }

    completeAttempts += 1;
    const since = deps.now();
    onEvent({ state: "checking", since, attempt: completeAttempts });
    try {
      const step3 = await deps.complete(ticket.fileId);
      return { kind: "done", file: step3.file, deduplicated: step3.deduplicated };
    } catch (e) {
      lastError = e;
      const verdict = classifyCompleteError(e);
      // Final refusals (413, 415, 507, content_mismatch…) are the user's
      // file, not an incident: telemetry gets the transient and the missing.
      if (verdict !== "final") {
        deps.report("complete", e, {
          fileId: ticket.fileId,
          status: statusOf(e),
          code: errorCodeOf(e),
          attempt: completeAttempts,
          elapsedMs: deps.now() - since,
        });
      }
      if (verdict === "missing") {
        if (putsLeft > 0 && urlAlive()) {
          mustPut = true;
          continue;
        }
        if (!urlAlive()) return { kind: "expired", ticket, error: e };
        return { kind: "stalled", ticket, error: e };
      }
      if (verdict === "final") {
        // Old contract: a repeat complete after a success it never heard of
        // answers 404. That is not «refused» — leave it to Retry/Start over.
        // A Retry (put: false) is always a repeat, even on its first call.
        if (statusOf(e) === 404 && (completeAttempts > 1 || !opts.put)) {
          return { kind: "stalled", ticket, error: e };
        }
        return { kind: "rejected", error: e, ticket };
      }
      if (completeAttempts >= 2) return { kind: "stalled", ticket, error: lastError };
      await deps.sleep(RETRY_PAUSE_MS);
    }
  }
}
