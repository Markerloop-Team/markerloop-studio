"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import {
  apiErrorCode,
  type InviteCreated,
  type WorkspaceMemberProfile,
} from "@/shared/lib/api/collections-client";
import {
  inviteErrorKey,
  inviteNoticeOf,
  useCreateInvite,
  useInvites,
  useRemoveMember,
  useResendInvite,
  useRevokeInvite,
  useWorkspaceMembers,
} from "@/entities/collections/member";
import type { Workspace } from "@/widgets/collections";

import {
  InviteCard,
  MembersTeam,
  MembersViewer,
  PendingInvites,
  RemoveMemberDialog,
  type InviteNotice,
} from "./members";

const statusOf = (error: unknown): unknown =>
  (error as { status?: unknown } | null)?.status;

// Moved to the member entity (SDL-727) so the Access tab's add-member form
// says the same sentences; re-exported for `smoke:workspace-members`.
export { inviteErrorKey };

/**
 * Key for a failed resend. 429 comes in two kinds: `invite_resend_too_soon`
 * (under 60 s since the last send — wait a minute) and `invite_rate_limited`
 * (the hourly / per-address ceiling — try later). Different advice, so
 * different sentences.
 */
export function resendErrorKey(error: unknown): string {
  switch (apiErrorCode(error)) {
    case "invite_resend_too_soon":
      return "resendTooSoon";
    case "invite_rate_limited":
      return "invite.errors.rateLimited";
  }
  return statusOf(error) === 429
    ? "invite.errors.rateLimited"
    : "pending.actionError";
}

/** Key for an invites list that did not load. */
export function invitesLoadErrorKey(error: unknown): string {
  return apiErrorCode(error) === "invites_unavailable"
    ? "pendingLoad.unavailable"
    : "pendingLoad.error";
}

/**
 * Members tab, wired (SDL-615).
 *
 * Which variant renders is decided by the workspace record, not by what
 * the members answer happened to contain: the current user owns it → list,
 * invite, pending invites — in ANY workspace, a personal one included
 * (SDL-753, EP-155: there is no personal-only variant any more); anyone
 * else → the read-only list (`members-viewer`). Invites are fetched for the
 * owner only — the server answers a member with 403.
 */
export function WorkspaceMembersTab({
  workspace,
  currentUserId,
}: {
  workspace: Workspace;
  currentUserId: string | null;
}) {
  const t = useTranslations("workspaceSettings");
  const isOwner =
    currentUserId !== null && workspace.owner_user_id === currentUserId;
  const membersQuery = useWorkspaceMembers(workspace.id, "profiles");

  if (membersQuery.isLoading) {
    return (
      <UI.Text as="p" size="sm" variant="muted" data-testid="members-loading">
        {t("loading")}
      </UI.Text>
    );
  }
  if (membersQuery.isError || !membersQuery.data) {
    return (
      <UI.Alert variant="destructive" data-testid="members-load-error">
        {t("loadError")}
      </UI.Alert>
    );
  }

  const members = membersQuery.data;
  // No personal-workspace branch any more (SDL-753, EP-155): every workspace
  // can have members, so its owner always gets the invite card — including
  // the owner alone in a fresh workspace.
  if (!isOwner) {
    return <MembersViewer members={members} currentUserId={currentUserId} />;
  }
  return (
    <OwnerMembers
      workspace={workspace}
      members={members}
      currentUserId={currentUserId}
    />
  );
}

function OwnerMembers({
  workspace,
  members,
  currentUserId,
}: {
  workspace: Workspace;
  members: WorkspaceMemberProfile[];
  currentUserId: string | null;
}) {
  const t = useTranslations("workspaceSettings");
  const locale = useLocale();
  const invitesQuery = useInvites(workspace.id);
  const createInvite = useCreateInvite(workspace.id);
  const resendInvite = useResendInvite(workspace.id);
  const revokeInvite = useRevokeInvite(workspace.id);
  const removeMember = useRemoveMember(workspace.id);

  const [email, setEmail] = React.useState("");
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<InviteNotice>(undefined);
  const [pendingError, setPendingError] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<WorkspaceMemberProfile | null>(
    null
  );
  const [removeError, setRemoveError] = React.useState<string | null>(null);
  // Days-left is computed against the render clock, once per mount.
  const [now] = React.useState(() => Date.now());

  const showNotice = (created: InviteCreated) =>
    setNotice(inviteNoticeOf(created));

  const invitesLoadError = invitesQuery.isError
    ? t(invitesLoadErrorKey(invitesQuery.error))
    : null;

  const inviteLocale =
    locale === "ru" || locale === "kk" || locale === "en" ? locale : "en";

  return (
    <UI.Box direction="column" gap={6} data-testid="members-team">
      <MembersTeam
        members={members}
        currentUserId={currentUserId}
        workspaceName={workspace.name}
        onRemove={(member) => {
          setRemoveError(null);
          setRemoving(member);
        }}
      />
      <InviteCard
        workspaceName={workspace.name}
        email={email}
        onEmailChange={(value) => {
          setEmail(value);
          setInviteError(null);
        }}
        sending={createInvite.isPending}
        error={inviteError}
        notice={notice}
        onSubmit={() => {
          const address = email.trim();
          if (!address) return;
          setInviteError(null);
          setNotice(undefined);
          createInvite.mutate(
            { email: address, locale: inviteLocale },
            {
              onSuccess: (created) => {
                setEmail("");
                showNotice(created);
              },
              onError: (error) => setInviteError(t(inviteErrorKey(error))),
            }
          );
        }}
      />
      <PendingInvites
        invites={invitesQuery.data ?? []}
        now={now}
        busy={resendInvite.isPending || revokeInvite.isPending}
        error={pendingError}
        loadError={invitesLoadError}
        onResend={(invite) => {
          setPendingError(null);
          resendInvite.mutate(invite.id, {
            onSuccess: showNotice,
            onError: (error) => setPendingError(t(resendErrorKey(error))),
          });
        }}
        onRevoke={(invite) => {
          setPendingError(null);
          revokeInvite.mutate(invite.id, {
            onError: () => setPendingError(t("pending.actionError")),
          });
        }}
      />
      <RemoveMemberDialog
        member={removing}
        workspaceName={workspace.name}
        pending={removeMember.isPending}
        error={removeError}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          removeMember.mutate(removing.user_id, {
            onSuccess: () => setRemoving(null),
            onError: () => setRemoveError(t("remove.error")),
          });
        }}
      />
    </UI.Box>
  );
}
