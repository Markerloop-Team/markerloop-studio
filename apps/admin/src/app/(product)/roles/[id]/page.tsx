"use client";

import { use, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { SectionHeader } from "@/shared/components/section-header";
import { useTranslations } from "@/shared/hooks";
import { ArrowLeft, Edit, Trash2, Settings } from "lucide-react";
import { useRole, useRolePermissions } from "@/entities/role/hooks";
import { useUsers, useUserRoles } from "@/entities/user/hooks";
import { userApi } from "@/entities/user/api";
import type { Role } from "@/entities/role/model";
import type { User } from "@/entities/user/model";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { EditRoleDialog } from "@/features/roles/edit-role-dialog";
import { DeleteRoleDialog } from "@/features/roles/delete-role-dialog";

// Отключаем статическую генерацию для этой страницы
export const dynamic = "force-dynamic";

interface RoleDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function RoleDetailPage({ params }: RoleDetailPageProps) {
  const router = useRouter();
  const t = useTranslations("common");
  const tNav = useTranslations("navigation");
  const { id } = use(params);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const { data: role, isLoading: roleLoading, error: roleError } = useRole(id);
  const { data: rolePermissions, isLoading: rolePermissionsLoading } = useRolePermissions(id);

  // Получаем всех пользователей для фильтрации по ролям
  const { data: usersResponse, isLoading: usersLoading } = useUsers();
  const allUsers = usersResponse?.users || [];

  // Получаем роли для каждого пользователя параллельно
  const userRolesQueries = useQueries({
    queries: allUsers.map((user) => ({
      queryKey: ["user", user.id, "roles"],
      queryFn: () => userApi.getUserRoles(user.id),
      enabled: allUsers.length > 0,
      staleTime: 5 * 60 * 1000, // 5 минут
    })),
  });

  // Проверяем, загружаются ли роли пользователей
  const isLoadingUserRoles = userRolesQueries.some((query) => query.isLoading);

  // Объединяем пользователей с их ролями
  const usersWithRoles = useMemo(() => {
    return allUsers.map((user, index) => ({
      user,
      roles: userRolesQueries[index]?.data || [],
    }));
  }, [allUsers, userRolesQueries]);

  // Фильтруем пользователей с данной ролью
  const usersWithThisRole = useMemo(() => {
    if (!usersWithRoles || usersWithRoles.length === 0) return [];
    return usersWithRoles
      .filter(({ roles }) => roles && roles.length > 0 && roles.some((r) => r.id === id))
      .map(({ user }) => user);
  }, [usersWithRoles, id]);

  const handleEdit = () => {
    if (role) {
      setSelectedRole(role);
      setEditDialogOpen(true);
    }
  };

  const handleDelete = () => {
    if (role) {
      setSelectedRole(role);
      setDeleteDialogOpen(true);
    }
  };

  if (roleLoading) {
    return (
      <Box gap={6}>
        <UI.Skeleton height={40} width={256} />
        <UI.Skeleton height={384} width="full" />
      </Box>
    );
  }

  if (roleError || !role) {
    return (
      <Box variant="center" padding={8}>
        <Box gap={4} textAlign="center">
          <UI.Text variant="destructive">{t("roleNotFound") as string}</UI.Text>
          <UI.Button onClick={() => router.push("/roles")}>
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
        crumbs={[{ label: tNav("roles") as string, href: "/roles" }, { label: role.name }]}
        title={role.name}
        description={t("roleDetails") as string}
        actions={
          <>
            <UI.Button
              variant="outline"
              onClick={() => router.push(`/roles/${role.id}/permissions`)}
            >
              <Settings size={16} />
              {t("managePermissions") as string}
            </UI.Button>
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
            <UI.Card.Description>{t("basicRoleData") as string}</UI.Card.Description>
          </UI.Card.Header>
          <UI.Card.Content>
            <Box gap={4}>
              <Box gap={1}>
                <UI.Text size="sm" weight="medium" variant="muted">
                  {t("id") as string}
                </UI.Text>
                <UI.Text as="span" variant="mono" size="sm">
                  {role.id}
                </UI.Text>
              </Box>
              <UI.Separator />
              <Box gap={1}>
                <UI.Text size="sm" weight="medium" variant="muted">
                  {t("name") as string}
                </UI.Text>
                <UI.Text as="span">{role.name}</UI.Text>
              </Box>
              <UI.Separator />
              <Box gap={1}>
                <UI.Text size="sm" weight="medium" variant="muted">
                  {t("description") as string}
                </UI.Text>
                {role.description ? (
                  <UI.Text as="span">{role.description}</UI.Text>
                ) : (
                  <UI.Text as="span" variant="muted" size="sm">
                    —
                  </UI.Text>
                )}
              </Box>
              <UI.Separator />
              <Box gap={1}>
                <UI.Text size="sm" weight="medium" variant="muted">
                  {t("dateCreated") as string}
                </UI.Text>
                <UI.Text as="span">{new Date(role.created_at).toLocaleString("ru-RU")}</UI.Text>
              </Box>
              <UI.Separator />
              <Box gap={1}>
                <UI.Text size="sm" weight="medium" variant="muted">
                  {t("lastUpdate") as string}
                </UI.Text>
                <UI.Text as="span">{new Date(role.updated_at).toLocaleString("ru-RU")}</UI.Text>
              </Box>
            </Box>
          </UI.Card.Content>
        </UI.Card>

        {/* Разрешения */}
        <UI.Card>
          <UI.Card.Header>
            <Box direction="row" align="center" justify="between" gap={2} wrap>
              <Box gap={1} className="min-w-0">
                <UI.Card.Title>{tNav("permissions") as string}</UI.Card.Title>
                <UI.Card.Description>{t("permissionsAssigned") as string}</UI.Card.Description>
              </Box>
              <UI.Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/roles/${role.id}/permissions`)}
              >
                {t("managePermissions") as string}
              </UI.Button>
            </Box>
          </UI.Card.Header>
          <UI.Card.Content>
            {rolePermissionsLoading ? (
              <Box gap={2}>
                <UI.Skeleton height={32} width="full" />
                <UI.Skeleton height={32} width="full" />
              </Box>
            ) : rolePermissions && rolePermissions.length > 0 ? (
              <Box gap={2}>
                {rolePermissions.slice(0, 5).map((permission) => (
                  <Box key={permission.id} variant="panel" padding={3}>
                    <Box gap={1}>
                      <UI.Text as="span" variant="mono" size="sm" weight="medium">
                        {permission.code}
                      </UI.Text>
                      <UI.Text as="span" variant="muted" size="xs">
                        {permission.method} {permission.path}
                      </UI.Text>
                    </Box>
                  </Box>
                ))}
                {rolePermissions.length > 5 && (
                  <UI.Text variant="muted" size="sm">
                    {t("andMore") as string} {rolePermissions.length - 5} {t("permissionsCount") as string}
                  </UI.Text>
                )}
              </Box>
            ) : (
              <UI.Text variant="muted" size="sm">
                {t("permissionsNotAssigned") as string}
              </UI.Text>
            )}
          </UI.Card.Content>
        </UI.Card>

        {/* Пользователи с этой ролью */}
        {/*
          Растяжка на всю ширину — тоже с lg, парой к сетке выше (SDL-474).
          `md:col-span-2` в одноколоночной сетке не «занимает обе колонки»,
          а СОЗДАЁТ вторую, неявную: на 768px это давало треки
          111px + 329px вместо одного на 464px. У кита есть только
          `mdColSpan`, поэтому брейкпоинт задаётся классом.
        */}
        <UI.Card className="lg:col-span-2">
          <UI.Card.Header>
            <UI.Card.Title>{t("usersWithRole") as string}</UI.Card.Title>
            <UI.Card.Description>
              {t("usersWithRoleDescription") as string}
            </UI.Card.Description>
          </UI.Card.Header>
          <UI.Card.Content>
            {usersLoading || isLoadingUserRoles ? (
              <Box gap={2}>
                <UI.Skeleton height={48} width="full" />
                <UI.Skeleton height={48} width="full" />
              </Box>
            ) : usersWithThisRole && usersWithThisRole.length > 0 ? (
              <Box gap={2}>
                {usersWithThisRole.map((user) => (
                  <UI.Link
                    key={user.id}
                    href={`/users/${user.id}`}
                  >
                    <Box gap={1}>
                      <UI.Text as="span" weight="medium">
                        {user.username}
                      </UI.Text>
                      {user.email ? (
                        <UI.Text as="span" size="sm" variant="muted">
                          {user.email}
                        </UI.Text>
                      ) : null}
                    </Box>
                    <UI.Button variant="ghost" size="sm" asChild>
                      <UI.Box as="span">{t("view") as string}</UI.Box>
                    </UI.Button>
                  </UI.Link>
                ))}
              </Box>
            ) : (
              <UI.Text variant="muted" size="sm">
                {t("noUsersWithRole") as string}
              </UI.Text>
            )}
          </UI.Card.Content>
        </UI.Card>
      </Box>

      {/* Модальные окна */}
      <EditRoleDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        role={selectedRole}
      />
      <DeleteRoleDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        role={selectedRole}
      />
    </Box>
  );
}

