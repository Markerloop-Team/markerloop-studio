// Server answers → screen states for /invite (SDL-615 S9). Pure, so the
// smoke runs every branch without a network.
//
// Contract (collections-service swagger, `/invites/preview` and
// `/invites/accept`, both POST {token}):
//  preview 200 → status valid|expired|used|revoked, already_member;
//  preview/accept 404 → unknown or mangled token;
//  accept 410 invite_used|invite_revoked|invite_expired;
//  accept 409 invite_own_workspace — the owner opened their own link (not spent);
//  accept 200 already_member:true — the link is NOT spent, just land.

import type { InvitePreview } from "@/shared/lib/api/collections-client";
import type { InviteDeadState } from "./invite-view";

export type InviteOutcome =
  | { kind: "live"; preview: InvitePreview }
  | { kind: "already-member"; workspaceName: string; workspaceId: string }
  | { kind: "own" }
  | { kind: InviteDeadState }
  | { kind: "signed-out" }
  | { kind: "network" };

export function outcomeFromPreview(preview: InvitePreview): InviteOutcome {
  switch (preview.status) {
    case "expired":
    case "used":
    case "revoked":
      return { kind: preview.status };
    case "valid":
      return preview.already_member
        ? {
            kind: "already-member",
            workspaceName: preview.workspace.name,
            workspaceId: preview.workspace.id,
          }
        : { kind: "live", preview };
    default:
      return { kind: "invalid" };
  }
}

function field(error: unknown, name: "status" | "data"): unknown {
  return typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)[name]
    : undefined;
}

/** Any failed preview/accept call → the state that explains it. */
export function outcomeFromError(error: unknown): InviteOutcome {
  const status = field(error, "status");
  const data = field(error, "data");
  const code =
    typeof data === "object" && data !== null
      ? (data as { error?: unknown }).error
      : undefined;

  if (status === 401) return { kind: "signed-out" };
  if (status === 409 && code === "invite_own_workspace") return { kind: "own" };
  if (status === 410) {
    if (code === "invite_used") return { kind: "used" };
    if (code === "invite_revoked") return { kind: "revoked" };
    return { kind: "expired" };
  }
  // 404 from the service carries its envelope; a bare gateway 404 (route not
  // published) has no code and is an outage, not a bad link.
  if (status === 404 && typeof code === "string") return { kind: "invalid" };
  if (status === 400) return { kind: "invalid" };
  return { kind: "network" };
}

/**
 * States after which the parked token is dropped: the link is dead (expired,
 * used, revoked, invalid) or it is the actor's own (nothing to accept).
 * `network` keeps it — Retry needs it; `signed-out` keeps it — that is the
 * whole point of parking.
 */
export function forgetsToken(kind: InviteOutcome["kind"]): boolean {
  return (
    kind === "own" ||
    kind === "expired" ||
    kind === "used" ||
    kind === "revoked" ||
    kind === "invalid"
  );
}

/** Where a joined (or already-joined) person lands. */
export function workspaceLanding(workspaceId: string): string {
  return `/pages?ws=${encodeURIComponent(workspaceId)}`;
}
