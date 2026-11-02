import {
  apiErrorCode,
  type InviteCreated,
} from "@/shared/lib/api/collections-client";

const statusOf = (error: unknown): unknown =>
  (error as { status?: unknown } | null)?.status;

/**
 * Catalogue key (under `workspaceSettings`) for a failed invite create.
 * Shared by Settings → Members and the Access tab's add-member form
 * (SDL-727): each server code gets its own sentence, and
 * `smoke:workspace-members` / `smoke:collections` pin which one.
 */
export function inviteErrorKey(error: unknown): string {
  switch (apiErrorCode(error)) {
    case "invite_resend_too_soon":
      return "resendTooSoon";
    case "already_member":
      return "invite.errors.alreadyMember";
    case "invite_rate_limited":
      return "invite.errors.rateLimited";
  }
  if (statusOf(error) === 400) return "invite.errors.invalidEmail";
  if (statusOf(error) === 429) return "invite.errors.rateLimited";
  return "invite.errors.generic";
}

/**
 * What the screen says after `POST /invites`: "sent" only when the mail was
 * accepted for delivery; otherwise "mailfail", and the one-time `accept_url`
 * is the way to hand the invite over.
 */
export interface InviteNoticeData {
  kind: "sent" | "mailfail";
  email: string;
  acceptUrl: string;
}

export function inviteNoticeOf(created: InviteCreated): InviteNoticeData {
  return {
    kind: created.email_status === "accepted_for_delivery" ? "sent" : "mailfail",
    email: created.invite.email,
    acceptUrl: created.accept_url,
  };
}
