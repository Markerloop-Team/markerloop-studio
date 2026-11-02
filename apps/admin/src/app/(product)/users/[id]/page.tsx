"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { SectionHeader } from "@/shared/components/section-header";
import { useTranslations } from "@/shared/hooks";
import { ArrowLeft, Edit, Trash2 } from "lucide-react";
import {
  useUser,
  useUserRoles,
  useUserPermissions,
  useUserExternalAccounts,
  useRemoveRoleFromUser,
} from "@/entities/user/hooks";
import type { User } from "@/entities/user/model";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { EditUserDialog } from "@/features/users/edit-user-dialog";
import { DeleteUserDialog } from "@/features/users/delete-user-dialog";
import { CreateExternalAccountDialog } from "@/features/users/create-external-account-dialog";
import { DeleteExternalAccountDialog } from "@/features/users/delete-external-account-dialog";
import { AssignRoleDialog } from "@/features/users/assign-role-dialog";
import { Plus, Trash2 as TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authService } from "@/shared/lib/api/auth";
import type { ExternalAccount } from "@/entities/user/api";
import Link from "next/link";
import { PermissionGuard } from "@/shared/components/permission-guard";
import { POLICY_JOURNAL_PERMISSION } from "@/entities/policy-acceptance";
import { UserPolicyHistory } from "@/widgets/policy-acceptances";

// Отключаем статическую генерацию для этой страницы
export const dynamic = "force-dynamic";

interface UserDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function UserDetailPage({ params }: UserDetailPageProps) {
  const router = useRouter();
  const t = useTranslations("common");
  const tNav = useTranslations("navigation");
  const { id } = use(params);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [createExternalAccountDialogOpen, setCreateExternalAccountDialogOpen] = useState(false);
  const [deleteExternalAccountDialogOpen, setDeleteExternalAccountDialogOpen] = useState(false);
  const [selectedExternalAccount, setSelectedExternalAccount] = useState<ExternalAccount | null>(null);
  const [assignRoleDialogOpen, setAssignRoleDialogOpen] = useState(false);

  const { data: user, isLoading: userLoading, error: userError } = useUser(id);
  const { data: roles, isLoading: rolesLoading } = useUserRoles(id);
  const { data: permissions, isLoading: permissionsLoading } = useUserPermissions(id);
  const { data: externalAccounts, isLoading: externalAccountsLoading } = useUserExternalAccounts(id);
  const removeRoleMutation = useRemoveRoleFromUser();

  const handleEdit = () => {
    if (user) {
      setSelectedUser(user);
      setEditDialogOpen(true);
    }
  };

  const handleDelete = () => {
    if (user) {
      setSelectedUser(user);
      setDeleteDialogOpen(true);
    }
  };

  if (userLoading) {
    return (
      <Box gap={6}>
        <UI.Skeleton height={40} width={256} />
        <UI.Skeleton height={384} width="full" />
      </Box>
    );
  }

  if (userError || !user) {
    return (
      <Box variant="center" padding={8}>
        <Box gap={4} textAlign="center">
          <UI.Text variant="destructive">{t("userNotFound") as string}</UI.Text>
          <UI.Button onClick={() => router.push("/users")}>
            <ArrowLeft size={16} />
            {t("backToList") as string}
          </UI.Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box gap={5}>
      <SectionHeader
        crumbs={[{ label: tNav("users") as string, href: "/users" }, { label: user.username }]}
        title={user.username}
        description={t("userDetails") as string}
        actions={
          <>
            <UI.Button variant="outline" onClick={handleEdit}>
              <Edit size={16} />
              {t("edit") as string}
            </UI.Button>
            <UI.Button variant="destructive" onClick={handleDelete}>
              <Trash2 size={16} />
              {t("delete") as string}
            </UI.Button>
          </>
        }
      />

      {/*
        Две колонки — с lg, а не с md (SDL-474).

        `md:` считается от вьюпорта, а карточки живут в <main>, из которого
        сайдбар уже вычел 256px: на 768px под две колонки остаётся 512px,
        то есть ~196px на колонку — уже, чем кнопка «Управление
        разрешениями» с её `whitespace-nowrap` (216px). Колонка ужаться
        не может, кнопка тоже, и рабочая область уезжает вбок
        (замер до починки: main scrollWidth 608 при clientWidth 512).
        Перенос строки в шапке карточки этого не лечит — он двигает
        кнопку вниз, а не делает её уже.
      */}
      <Box variant="grid" gap={6} columns={1} lgColumns={2}>
        {/* Основная информация */}
        <UI.Card>
          <UI.Card.Header>
            <UI.Card.Title>{t("basicInfo") as string}</UI.Card.Title>
            <UI.Card.Description>{t("basicUserData") as string}</UI.Card.Description>
          </UI.Card.Header>
          <UI.Card.Content>
            <Box gap={4}>
              <Box gap={1}>
                <UI.Text size="sm" weight="medium" variant="muted">
                  {t("id") as string}
                </UI.Text>
                <UI.Text as="span" variant="mono" size="sm">
                  {user.id}
                </UI.Text>
              </Box>
              <UI.Separator />
              <Box gap={1}>
                <UI.Text size="sm" weight="medium" variant="muted">
                  {t("username") as string}
                </UI.Text>
                <UI.Text as="span">{user.username}</UI.Text>
              </Box>
              <UI.Separator />
              <Box gap={1}>
                <UI.Text size="sm" weight="medium" variant="muted">
                  {t("email") as string}
                </UI.Text>
                {user.email ? (
                  <UI.Text as="span">{user.email}</UI.Text>
                ) : (
                  <UI.Text as="span" variant="muted" size="sm">
                    —
                  </UI.Text>
                )}
              </Box>
              <UI.Separator />
              <Box gap={1}>
                <UI.Text size="sm" weight="medium" variant="muted">
                  {t("emailVerifiedStatus") as string}
                </UI.Text>
                <UI.Text
                  as="span"
                  variant={user.email_verified ? "success" : "danger"}
                  size="sm"
                  weight="medium"
                >
                  {user.email_verified ? (t("yes") as string) : (t("no") as string)}
                </UI.Text>
                {!user.email_verified && user.email && (
                  <SendVerificationButton email={user.email} />
                )}
              </Box>
            {user.email_verified_at && (
              <>
                <UI.Separator />
                <Box gap={1}>
                  <UI.Text size="sm" weight="medium" variant="muted">
                    {t("emailVerificationDate") as string}
                  </UI.Text>
                  <UI.Text as="span">
                    {new Date(user.email_verified_at).toLocaleString("ru-RU")}
                  </UI.Text>
                </Box>
              </>
            )}
            <UI.Separator />
            <Box gap={1}>
              <UI.Text size="sm" weight="medium" variant="muted">
                {t("dateCreated") as string}
              </UI.Text>
              <UI.Text as="span">{new Date(user.created_at).toLocaleString("ru-RU")}</UI.Text>
            </Box>
            <UI.Separator />
            <Box gap={1}>
              <UI.Text size="sm" weight="medium" variant="muted">
                {t("lastUpdate") as string}
              </UI.Text>
              <UI.Text as="span">{new Date(user.updated_at).toLocaleString("ru-RU")}</UI.Text>
            </Box>
            </Box>
          </UI.Card.Content>
        </UI.Card>

        {/* Роли */}
        <UI.Card>
          <UI.Card.Header>
            <Box direction="row" align="center" justify="between" gap={2} wrap>
              <Box gap={1} className="min-w-0">
                <UI.Card.Title>{tNav("roles") as string}</UI.Card.Title>
                <UI.Card.Description>{t("rolesAssigned") as string}</UI.Card.Description>
              </Box>
              <UI.Button
                size="sm"
                variant="outline"
                onClick={() => setAssignRoleDialogOpen(true)}
              >
                <Plus size={16} />
                {t("dialogs.users.assignRole") as string}
              </UI.Button>
            </Box>
          </UI.Card.Header>
          <UI.Card.Content>
            {rolesLoading ? (
              <Box gap={2}>
                <UI.Skeleton height={32} width="full" />
                <UI.Skeleton height={32} width="full" />
              </Box>
            ) : roles && roles.length > 0 ? (
              <Box gap={2}>
                {roles.map((role) => (
                  <Box key={role.id} variant="panel" padding={3}>
                    <Box direction="row" align="center" justify="between">
                      <Box gap={1}>
                        <UI.Text as="span" weight="medium">
                          {role.name}
                        </UI.Text>
                        {role.description ? (
                          <UI.Text as="span" size="sm" variant="muted">
                            {role.description}
                          </UI.Text>
                        ) : null}
                      </Box>
                      <UI.Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          removeRoleMutation.mutate(
                            { userId: id, roleId: role.id },
                            {
                              onSuccess: () => {
                                toast.success(t("dialogs.users.roleRemovedSuccess") as string);
                              },
                              onError: (error) => {
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : (t("dialogs.users.removeRoleError") as string)
                                );
                              },
                            }
                          );
                        }}
                        disabled={removeRoleMutation.isPending}
                        aria-label={t("delete") as string}
                      >
                        <UI.Text as="span" variant="destructive">
                          <TrashIcon size={16} />
                        </UI.Text>
                      </UI.Button>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Box gap={4} textAlign="center">
                <UI.Text variant="muted" size="sm">
                  {t("rolesNotAssigned") as string}
                </UI.Text>
                <UI.Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAssignRoleDialogOpen(true)}
                >
                  <Plus size={16} />
                  {t("dialogs.users.assignRole") as string}
                </UI.Button>
              </Box>
            )}
          </UI.Card.Content>
        </UI.Card>

        {/* Разрешения */}
        <UI.Card>
          <UI.Card.Header>
            <UI.Card.Title>{tNav("permissions") as string}</UI.Card.Title>
            <UI.Card.Description>{tNav("permissions") as string}</UI.Card.Description>
          </UI.Card.Header>
          <UI.Card.Content>
            {permissionsLoading ? (
              <Box gap={2}>
                <UI.Skeleton height={32} width="full" />
                <UI.Skeleton height={32} width="full" />
              </Box>
            ) : permissions && permissions.length > 0 ? (
              <Box gap={2}>
                {permissions.map((permission) => (
                  <Box key={permission.id} variant="panel" padding={3}>
                    <Box gap={1}>
                      <UI.Text as="span" weight="medium">
                        {permission.method} {permission.path}
                      </UI.Text>
                      {permission.description ? (
                        <UI.Text as="span" size="sm" variant="muted">
                          {permission.description}
                        </UI.Text>
                      ) : null}
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <UI.Text variant="muted" size="sm">
                {t("permissionsNotAssigned") as string}
              </UI.Text>
            )}
          </UI.Card.Content>
        </UI.Card>

        {/* SDL-752: the person's rule acceptances, behind the journal right */}
        <PermissionGuard permission={POLICY_JOURNAL_PERMISSION}>
          <UserPolicyHistory
            user={{ id: user.id, username: user.username, email: user.email ?? null }}
          />
        </PermissionGuard>

        {/* Внешние аккаунты */}
        <UI.Card>
          <UI.Card.Header>
            <Box direction="row" align="center" justify="between" gap={2} wrap>
              <Box gap={1} className="min-w-0">
                <UI.Card.Title>{t("externalAccounts") as string}</UI.Card.Title>
                <UI.Card.Description>{t("linkedExternalAccounts") as string}</UI.Card.Description>
              </Box>
              <UI.Button
                size="sm"
                variant="outline"
                onClick={() => setCreateExternalAccountDialogOpen(true)}
              >
                <Plus size={16} />
                {t("add") as string}
              </UI.Button>
            </Box>
          </UI.Card.Header>
          <UI.Card.Content>
            {externalAccountsLoading ? (
              <Box gap={2}>
                <UI.Skeleton height={32} width="full" />
                <UI.Skeleton height={32} width="full" />
              </Box>
            ) : externalAccounts && externalAccounts.length > 0 ? (
              <Box gap={2}>
                {externalAccounts.map((account) => (
                  <Box key={account.id} variant="panel" padding={3}>
                    <Box direction="row" align="center" justify="between">
                      <Box gap={1} grow>
                        <UI.Text as="span" weight="medium">
                          {account.provider}
                        </UI.Text>
                        {account.username ? (
                          <UI.Text as="span" size="sm" variant="muted">
                            {account.username}
                          </UI.Text>
                        ) : null}
                        {account.display_name ? (
                          <UI.Text as="span" size="sm" variant="muted">
                            {account.display_name}
                          </UI.Text>
                        ) : null}
                        <UI.Text as="span" size="xs" variant="muted">
                          {t("id") as string}: {account.external_id}
                        </UI.Text>
                      </Box>
                      <Box direction="row" align="center" gap={4}>
                        <Box gap={1} textAlign="right">
                          <UI.Text
                            as="span"
                            size="xs"
                            variant={account.is_active ? "success" : "danger"}
                            weight="medium"
                          >
                            {account.is_active ? (t("active") as string) : (t("inactive") as string)}
                          </UI.Text>
                          {account.last_used_at ? (
                            <UI.Text as="span" size="xs" variant="muted">
                              {t("used") as string}:{" "}
                              {new Date(account.last_used_at).toLocaleDateString("ru-RU")}
                            </UI.Text>
                          ) : null}
                        </Box>
                        <UI.Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedExternalAccount(account);
                            setDeleteExternalAccountDialogOpen(true);
                          }}
                          aria-label={t("deleteExternalAccount") as string}
                        >
                          <UI.Text as="span" variant="destructive">
                            <TrashIcon size={16} />
                          </UI.Text>
                        </UI.Button>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Box gap={4} textAlign="center">
                <UI.Text variant="muted" size="sm">
                  {t("externalAccountsNotLinked") as string}
                </UI.Text>
                <UI.Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateExternalAccountDialogOpen(true)}
                >
                  <Plus size={16} />
                  {t("addExternalAccount") as string}
                </UI.Button>
              </Box>
            )}
          </UI.Card.Content>
        </UI.Card>
      </Box>

      {/* Модальные окна */}
      <EditUserDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        user={selectedUser}
      />
      <DeleteUserDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        user={selectedUser}
      />
      <CreateExternalAccountDialog
        open={createExternalAccountDialogOpen}
        onOpenChange={setCreateExternalAccountDialogOpen}
        userId={id}
      />
      <DeleteExternalAccountDialog
        open={deleteExternalAccountDialogOpen}
        onOpenChange={setDeleteExternalAccountDialogOpen}
        account={selectedExternalAccount}
        userId={id}
      />
      <AssignRoleDialog
        open={assignRoleDialogOpen}
        onOpenChange={setAssignRoleDialogOpen}
        userId={id}
        assignedRoleIds={roles?.map((r) => r.id) || []}
      />
    </Box>
  );
}

function SendVerificationButton({ email }: { email: string }) {
  const [isSending, setIsSending] = useState(false);
  const tVerify = useTranslations("common");

  const handleSend = async () => {
    setIsSending(true);
    try {
      await authService.requestEmailVerification(email);
      toast.success(tVerify("emailVerification.sent") as string);
    } catch {
      toast.error(tVerify("emailVerification.error") as string);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <UI.Button
      size="sm"
      variant="outline"
      onClick={handleSend}
      disabled={isSending}
      className="mt-1"
    >
      {isSending ? (tVerify("emailVerification.sending") as string) : (tVerify("emailVerification.resend") as string)}
    </UI.Button>
  );
}
