import type { SaunaId } from "../schema/types";
import type { SaunaVersion } from "./types";

export class SaunaNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaunaNotFoundError";
  }
}

/**
 * Thrown by a provider's `put` when `ifMatch` was supplied and does not
 * match the stored version. Carries the server's view of the latest
 * version (when known) so the Studio can offer "reload then retry".
 */
export class SaunaConflictError extends Error {
  constructor(
    public readonly id: SaunaId,
    public readonly latestVersion?: SaunaVersion,
    message?: string
  ) {
    super(message ?? `Optimistic concurrency conflict for sauna "${id}"`);
    this.name = "SaunaConflictError";
  }
}

/**
 * Type guards for `provider.get()` / `provider.put()` rejections.
 *
 * Why these exist: `instanceof SaunaNotFoundError` is unreliable
 * across bundler boundaries. Next.js can resolve the package
 * differently for the server (CJS) and the route handlers (ESM),
 * which produces two distinct class identities. The class name
 * survives that — it is a string baked into the constructor.
 *
 * Use these helpers in app code instead of `instanceof`.
 */
export function isSaunaNotFoundError(e: unknown): e is SaunaNotFoundError {
  return e instanceof Error && e.name === "SaunaNotFoundError";
}

export function isSaunaConflictError(e: unknown): e is SaunaConflictError {
  return e instanceof Error && e.name === "SaunaConflictError";
}

/**
 * Thrown by a provider when the backend refuses the caller: 401 (no
 * credentials, or a request that bypassed the gateway) or 403 (the actor is
 * not a member of the requested workspace — `workspace_scope_mismatch`).
 *
 * Added in the Markerloop move (SDL-603) for the pages-service provider: a
 * foreign workspace must surface as an explicit refusal, never as data and
 * never as a generic `Error` a caller might retry.
 */
export class SaunaAccessDeniedError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code?: string,
    message?: string
  ) {
    super(message ?? `Access denied (HTTP ${status}${code ? `, ${code}` : ""})`);
    this.name = "SaunaAccessDeniedError";
  }
}

export function isSaunaAccessDeniedError(e: unknown): e is SaunaAccessDeniedError {
  return e instanceof Error && e.name === "SaunaAccessDeniedError";
}
