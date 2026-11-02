// Self-deletion of the account (SDL-743, EP-142) over user-service's
// DELETE /v1/users/my (SDL-742). The contract, read from user-service
// (internal/handlers/user_handler.go, DeleteMyAccount):
//
//   204 — the account is gone (a repeat after success is 204 too);
//   409 `user_owns_shared_workspaces` — the person owns workspaces other
//       people are members of; nothing was deleted and the account is live
//       again. Envelope: {success:false, message, error, data:{workspaces:
//       [{id, name}]}};
//   503 `account_deletion_incomplete` — started, a step in another service
//       failed; a repeat finishes it (the account stays marked, sign-in shut);
//   503 `account_deletion_unavailable` — not configured on this server;
//   anything else — a plain failure.
//
// Pure functions here, so smoke:account-delete runs every branch.

import { apiClient } from "@/shared/lib/api/client";

export const DELETE_MY_ACCOUNT_PATH = "/v1/users/my";
export const SHARED_WORKSPACES_CODE = "user_owns_shared_workspaces";
export const DELETION_INCOMPLETE_CODE = "account_deletion_incomplete";
export const DELETION_UNAVAILABLE_CODE = "account_deletion_unavailable";

export type BlockingWorkspace = { id: string; name: string };

/** What the dialog shows after a failed request. */
export type DeleteAccountFailure =
  | { kind: "blocked"; workspaces: BlockingWorkspace[] }
  | { kind: "incomplete" }
  | { kind: "unavailable" }
  | { kind: "failed" };

export async function deleteMyAccount(): Promise<void> {
  await apiClient.delete<unknown>(DELETE_MY_ACCOUNT_PATH);
}

/** The typed confirmation matches the username — exact, spaces trimmed. */
export function confirmationMatches(typed: string, username: string | null | undefined): boolean {
  const expected = username?.trim() ?? "";
  return expected.length > 0 && typed.trim() === expected;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function workspacesFrom(value: unknown): BlockingWorkspace[] {
  if (!Array.isArray(value)) return [];
  const out: BlockingWorkspace[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) continue;
    out.push({ id: item.id, name: typeof item.name === "string" && item.name ? item.name : item.id });
  }
  return out;
}

/**
 * Reads an error thrown by apiClient. Its `data` is the whole envelope on a
 * non-2xx answer (readErrorBody); the bare `data` object is accepted too, so
 * the dialog does not depend on which of the client's two paths built it.
 * Status and code are read by shape, never by `instanceof`.
 */
export function deleteAccountFailureOf(error: unknown): DeleteAccountFailure {
  if (!isRecord(error)) return { kind: "failed" };
  const status = typeof error.status === "number" ? error.status : 0;
  const body = isRecord(error.data) ? error.data : {};
  const code = typeof body.error === "string" ? body.error : undefined;
  const inner = isRecord(body.data) ? body.data : body;

  if (status === 409 && (code === undefined || code === SHARED_WORKSPACES_CODE)) {
    return { kind: "blocked", workspaces: workspacesFrom(inner.workspaces) };
  }
  // By code, not status: the client maps every 500/502/503 to ServerError,
  // whose status reads 500 (error-handler.ts toApiError) — the body survives.
  if (code === DELETION_INCOMPLETE_CODE) return { kind: "incomplete" };
  if (code === DELETION_UNAVAILABLE_CODE) return { kind: "unavailable" };
  return { kind: "failed" };
}

/** Where a blocking workspace is managed (and deleted). */
export function workspaceSettingsHref(id: string): string {
  return `/settings/workspace?ws=${encodeURIComponent(id)}`;
}
