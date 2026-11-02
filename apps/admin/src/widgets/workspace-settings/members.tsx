"use client";

import * as React from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Copy } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import type {
  WorkspaceInvite,
  WorkspaceMemberProfile,
} from "@/shared/lib/api/collections-client";

import { SettingsCard, SettingsRow } from "./settings-card";

/**
 * Members tab of the workspace settings (SDL-615) — presentation only.
 *
 * Every piece is the canvas `/design-system/workspace` case of the same name
 * (`members`, `members-team`, `members-sent`, `members-mailfail`,
 * `members-remove`, `members-viewer`) with the same testids, fed by live
 * rows instead of fixtures. Data and mutations live in `members-tab.tsx`;
 * `smoke:workspace-members` renders these with live-shaped rows.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A member's display name: username, else the raw id (profiles missing). */
export function memberName(member: WorkspaceMemberProfile): string {
  return member.username || member.user_id;
}

function initialsOf(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

/** Owner first, then by join time — the canvas order. */
export function sortMembers(
  members: readonly WorkspaceMemberProfile[]
): WorkspaceMemberProfile[] {
  return [...members].sort((a, b) => {
    if (a.role === "owner" && b.role !== "owner") return -1;
    if (b.role === "owner" && a.role !== "owner") return 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

/**
 * Invites the pending card lists: live and expired ones. Used and revoked
 * invites are history, not something the owner still waits for.
 */
export function pendingInvites(
  invites: readonly WorkspaceInvite[]
): WorkspaceInvite[] {
  return invites.filter(
    (invite) => invite.status === "valid" || invite.status === "expired"
  );
}

/** Whole days left, rounded up: «expires in 7 days» right after sending. */
export function daysLeft(expiresAt: string, now: number): number {
  return Math.max(1, Math.ceil((Date.parse(expiresAt) - now) / DAY_MS));
}

/* ------------------------------------------------------- owner view */

/**
 * The member list as the OWNER sees it. «Remove» on every row except the
 * owner's: the model has no ownerless workspace, and the server refuses it
 * anyway (`ErrWorkspaceOwnerImmutable`) — a button that can only fail is
 * a defect, and `smoke:workspace-members` fails on it.
 */
export function MembersTeam({
  members,
  currentUserId,
  onRemove,
  workspaceName,
}: {
  members: readonly WorkspaceMemberProfile[];
  currentUserId: string | null;
  onRemove: (member: WorkspaceMemberProfile) => void;
  /** Named in the title so it is plain whose members these are (SDL-753). */
  workspaceName?: string;
}) {
  const t = useTranslations("workspaceSettings");
  const rows = sortMembers(members);
  return (
    <SettingsCard
      testid="members-team-list"
      title={
        workspaceName
          ? t("team.titleOf", { workspace: workspaceName })
          : t("team.title")
      }
      description={t("team.description", { count: rows.length })}
    >
      {rows.map((member) => {
        const name = memberName(member);
        const role = member.role === "owner" ? "owner" : "member";
        const invitedAs =
          member.invited_email &&
          member.invited_email.toLowerCase() !==
            (member.email ?? "").toLowerCase()
            ? member.invited_email
            : null;
        return (
          <SettingsRow
            key={member.user_id}
            testid="member-row"
            data={{ "data-role": role, "data-member-id": member.user_id }}
            title={member.user_id === currentUserId ? t("you", { name }) : name}
            description={
              <>
                {member.email ? `${member.email} · ` : null}
                {t(`role.${role}`)}
                {invitedAs ? (
                  <>
                    {" "}
                    ·{" "}
                    <span data-testid="member-invited-as">
                      {t("team.invitedAs", { email: invitedAs })}
                    </span>
                  </>
                ) : null}
              </>
            }
            action={
              role === "owner" ? null : (
                <UI.Button
                  variant="outline"
                  size="sm"
                  data-testid="member-remove"
                  onClick={() => onRemove(member)}
                >
                  {t("team.remove")}
                </UI.Button>
              )
            }
          />
        );
      })}
    </SettingsCard>
  );
}

/** What became of the last send: the notice under the invite field. */
export type InviteNotice =
  | { kind: "sent" | "mailfail"; email: string; acceptUrl: string }
  | undefined;

export function InviteCard({
  email,
  onEmailChange,
  onSubmit,
  sending,
  error,
  notice,
  workspaceName,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
  sending: boolean;
  error: string | null;
  notice: InviteNotice;
  /** The workspace the person joins, named in the title (SDL-753). */
  workspaceName?: string;
}) {
  const t = useTranslations("workspaceSettings");
  return (
    <SettingsCard
      testid="members-invite-card"
      title={
        workspaceName
          ? t("invite.titleTo", { workspace: workspaceName })
          : t("invite.title")
      }
      description={t("invite.description")}
    >
      <UI.Box direction="column" gap={2} className="px-4 py-3">
        <UI.FormControl.Label htmlFor="members-invite-email">
          {t("invite.emailLabel")}
        </UI.FormControl.Label>
        <UI.Box
          as="form"
          direction="row"
          align="center"
          gap={2}
          wrap
          data-testid="members-invite-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <UI.Box grow className="min-w-[12rem]">
            <UI.FormControl.Input
              id="members-invite-email"
              type="email"
              required
              autoComplete="off"
              placeholder={t("invite.placeholder")}
              value={email}
              disabled={sending}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onEmailChange(event.target.value)
              }
              data-testid="members-invite-email"
            />
          </UI.Box>
          <UI.Button
            type="submit"
            size="sm"
            disabled={sending || email.trim() === ""}
            data-testid="members-invite-submit"
          >
            {t("invite.submit")}
          </UI.Button>
        </UI.Box>
        {error ? (
          <UI.Text
            as="p"
            size="sm"
            variant="destructive"
            role="alert"
            data-testid="members-invite-error"
          >
            {error}
          </UI.Text>
        ) : null}
        <UI.Text
          as="p"
          size="sm"
          variant="muted"
          data-testid="members-invite-hint"
        >
          {t("invite.hint")}
        </UI.Text>
      </UI.Box>
      {notice ? <InviteNoticeView notice={notice} /> : null}
    </SettingsCard>
  );
}

function InviteNoticeView({ notice }: { notice: NonNullable<InviteNotice> }) {
  const t = useTranslations("workspaceSettings");
  const [copied, setCopied] = React.useState(false);
  const sent = notice.kind === "sent";
  return (
    <UI.Box className="px-4 py-3">
      <UI.Alert
        data-testid={sent ? "members-invite-sent" : "members-invite-mailfail"}
      >
        <UI.Box direction="row" align="center" gap={3} wrap>
          <UI.Box direction="column" gap={1} grow className="min-w-[12rem]">
            <UI.Text as="p" size="sm" weight="medium">
              {sent
                ? t("invite.sentTitle", { email: notice.email })
                : t("invite.mailfailTitle", { email: notice.email })}
            </UI.Text>
            <UI.Text as="p" size="sm">
              {sent ? t("invite.sentBody") : t("invite.mailfailBody")}
            </UI.Text>
          </UI.Box>
          <UI.Button
            variant="outline"
            size="sm"
            data-testid="members-invite-copy-link"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(notice.acceptUrl)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            <Copy size={14} aria-hidden="true" />
            {copied ? t("invite.copied") : t("invite.copyLink")}
          </UI.Button>
        </UI.Box>
      </UI.Alert>
    </UI.Box>
  );
}

/**
 * Pending invites — a card of their own, not grey rows in the member list:
 * an invitee has no access yet. An expired one stays with a mark; «Resend»
 * issues a fresh link for seven days.
 */
export function PendingInvites({
  invites,
  now,
  busy,
  error,
  loadError = null,
  onResend,
  onRevoke,
}: {
  invites: readonly WorkspaceInvite[];
  now: number;
  busy: boolean;
  error: string | null;
  /**
   * The invites list did not load (503 `invites_unavailable`, 403, network).
   * The card stays and says so: hiding it would read as «nobody is
   * pending», which the screen does not know.
   */
  loadError?: string | null;
  onResend: (invite: WorkspaceInvite) => void;
  onRevoke: (invite: WorkspaceInvite) => void;
}) {
  const t = useTranslations("workspaceSettings");
  const rows = pendingInvites(invites);
  if (loadError) {
    return (
      <SettingsCard
        testid="members-invite-pending"
        title={t("pending.title")}
        description={t("pending.description")}
      >
        <UI.Box className="px-4 py-3">
          <UI.Alert
            variant="destructive"
            data-testid="members-invite-pending-error"
          >
            {loadError}
          </UI.Alert>
        </UI.Box>
      </SettingsCard>
    );
  }
  if (rows.length === 0) return null;
  return (
    <SettingsCard
      testid="members-invite-pending"
      title={t("pending.title")}
      description={t("pending.description")}
    >
      {rows.map((invite) => (
        <SettingsRow
          key={invite.id}
          testid="members-invite-pending-row"
          data={{ "data-invite-id": invite.id, "data-status": invite.status }}
          title={invite.email}
          description={
            invite.status === "expired" ? (
              <span data-testid="members-invite-expired">
                {t("pending.expired")}
              </span>
            ) : (
              t("pending.expires", { days: daysLeft(invite.expires_at, now) })
            )
          }
          action={
            <UI.Box direction="row" align="center" gap={2} wrap>
              <UI.Button
                variant="outline"
                size="sm"
                disabled={busy}
                data-testid="members-invite-resend"
                onClick={() => onResend(invite)}
              >
                {t("pending.resend")}
              </UI.Button>
              <UI.Button
                variant="ghost"
                size="sm"
                disabled={busy}
                data-testid="members-invite-revoke"
                onClick={() => onRevoke(invite)}
              >
                {t("pending.revoke")}
              </UI.Button>
            </UI.Box>
          }
        />
      ))}
      {error ? (
        <UI.Box className="px-4 py-3">
          <UI.Text as="p" size="sm" variant="destructive" role="alert">
            {error}
          </UI.Text>
        </UI.Box>
      ) : null}
    </SettingsCard>
  );
}

/**
 * Removing a member — a dialog, because the consequence leaves the screen:
 * access ends at once, even in tabs already open.
 */
export function RemoveMemberDialog({
  member,
  workspaceName,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  member: WorkspaceMemberProfile | null;
  workspaceName: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("workspaceSettings");
  const name = member ? memberName(member) : "";
  return (
    <UI.Dialog.Root
      open={member !== null}
      onOpenChange={(open: boolean) => {
        if (!open && !pending) onCancel();
      }}
    >
      <UI.Dialog.Content
        showCloseButton={false}
        maxWidth={480}
        data-testid="remove-member-dialog"
      >
        <UI.Dialog.Header>
          <UI.Dialog.Title>{t("remove.title", { name })}</UI.Dialog.Title>
          <UI.Dialog.Description>
            {member?.email
              ? t("remove.description", {
                  name,
                  email: member.email,
                  workspace: workspaceName,
                })
              : t("remove.descriptionNoEmail", {
                  name,
                  workspace: workspaceName,
                })}
          </UI.Dialog.Description>
        </UI.Dialog.Header>

        <RemoveMemberBody
          pending={pending}
          error={error}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

/**
 * The dialog's body — warning, refusal, buttons. A separate component
 * because the dialog itself renders through a portal, which is empty under
 * `renderToString`: `smoke:workspace-members` renders this body directly,
 * the way `smoke:pages` renders its dialog bodies.
 */
export function RemoveMemberBody({
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("workspaceSettings");
  return (
    <>
      <UI.Alert data-testid="remove-member-warning">
        {t("remove.warning")}
      </UI.Alert>

      {error ? (
        <UI.Text as="p" size="sm" variant="destructive" role="alert">
          {error}
        </UI.Text>
      ) : null}

      <UI.Dialog.Footer>
        <UI.Button variant="ghost" disabled={pending} onClick={onCancel}>
          {t("remove.cancel")}
        </UI.Button>
        <UI.Button
          variant="destructive"
          disabled={pending}
          data-testid="remove-member-submit"
          onClick={onConfirm}
        >
          {t("remove.submit")}
        </UI.Button>
      </UI.Dialog.Footer>
    </>
  );
}

/* ------------------------------------------------------- member view */

/**
 * The same list as a MEMBER sees it: names and roles, no buttons and no
 * addresses (the server does not send them to a member either).
 */
export function MembersViewer({
  members,
  currentUserId,
}: {
  members: readonly WorkspaceMemberProfile[];
  currentUserId: string | null;
}) {
  const t = useTranslations("workspaceSettings");
  const rows = sortMembers(members);
  const owner = rows.find((member) => member.role === "owner");
  return (
    <UI.Box direction="column" gap={6} data-testid="members-viewer">
      <SettingsCard
        testid="members-viewer-list"
        title={t("team.title")}
        description={t("viewer.description", {
          owner: owner ? memberName(owner) : t("role.owner"),
        })}
      >
        {rows.map((member) => {
          const name = memberName(member);
          const role = member.role === "owner" ? "owner" : "member";
          return (
            <SettingsRow
              key={member.user_id}
              testid="member-row"
              data={{ "data-role": role, "data-member-id": member.user_id }}
              title={
                member.user_id === currentUserId ? t("you", { name }) : name
              }
              description={t(`role.${role}`)}
              action={
                <UI.Avatar size={8}>
                  <UI.Avatar.Fallback>{initialsOf(name)}</UI.Avatar.Fallback>
                </UI.Avatar>
              }
            />
          );
        })}
      </SettingsCard>
    </UI.Box>
  );
}
