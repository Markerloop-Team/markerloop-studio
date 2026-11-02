"use client";

import { use, useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SectionHeader } from "@/shared/components/section-header";
import { useTranslations } from "@/shared/hooks";
import { ArrowLeft, Save } from "lucide-react";
import { useRole, useRolePermissions, useAssignPermissionToRole, useRemovePermissionFromRole } from "@/entities/role/hooks";
import { useQuery } from "@tanstack/react-query";
import { permissionApi } from "@/entities/permission/api";
import type { Permission } from "@/entities/permission/model";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { toast } from "sonner";

// Отключаем статическую генерацию для этой страницы
export const dynamic = "force-dynamic";

interface RolePermissionsPageProps {
  params: Promise<{ id: string }>;
}

// Группировка разрешений по префиксу
interface GroupedPermissions {
  prefix: string;
  permissions: Permission[];
}

// Компонент для чекбокса группы
function GroupCheckbox({
  group,
  isFullySelected,
  isPartiallySelected,
  onSelect,
  onDeselect,
}: {
  group: GroupedPermissions;
  isFullySelected: boolean;
  isPartiallySelected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
}) {
  return (
    <UI.ListHeader
      title={
        <Box direction="row" align="center" gap={3}>
          <UI.FormControl.Checkbox
            checked={isFullySelected ? true : isPartiallySelected ? "indeterminate" : false}
            onCheckedChange={(checked) => {
              if (checked) {
                onSelect();
              } else {
                onDeselect();
              }
            }}
          />
          <UI.Text as="h3" size="lg" weight="semibold">
            {group.prefix.replace(/_/g, " ")}
          </UI.Text>
        </Box>
      }
      right={<UI.Badge variant="secondary">{group.permissions.length}</UI.Badge>}
    />
  );
}

export default function RolePermissionsPage({ params }: RolePermissionsPageProps) {
  const router = useRouter();
  const t = useTranslations("common");
  const tNav = useTranslations("navigation");
  const { id } = use(params);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const { data: role, isLoading: roleLoading } = useRole(id);
  const { data: rolePermissions, isLoading: rolePermissionsLoading } = useRolePermissions(id);
  const assignPermissionMutation = useAssignPermissionToRole();
  const removePermissionMutation = useRemovePermissionFromRole();

  const { data: allPermissions = [], isLoading: allPermissionsLoading } = useQuery({
    queryKey: ["permissions", "all"],
    queryFn: async () => {
      // API поддерживает пагинацию, поэтому забираем все страницы, чтобы на экране
      // можно было включить permissions, которых нет в первой странице.
      const limit = 200;
      let page = 1;
      let total: number | undefined;
      const acc: Permission[] = [];

      // Защита от бесконечного цикла на случай неконсистентного total.
      const MAX_PAGES = 200;

      while (page <= MAX_PAGES) {
        const res = await permissionApi.getAllPermissions({ page, limit });
        const chunk = res.permissions ?? [];
        total = typeof res.total === "number" ? res.total : total;
        acc.push(...chunk);

        if (chunk.length === 0) break;
        if (typeof total === "number" && acc.length >= total) break;

        page += 1;
      }

      return acc;
    },
    staleTime: 5 * 60 * 1000, // 5 минут
  });

  // Инициализируем выбранные разрешения при загрузке
  useEffect(() => {
    if (rolePermissions && rolePermissions.length > 0) {
      const assignedIds = new Set(rolePermissions.map((p) => p.id));
      setSelectedPermissions(assignedIds);
    } else if (rolePermissions && rolePermissions.length === 0) {
      // Если разрешений нет, очищаем выбор
      setSelectedPermissions(new Set());
    }
  }, [rolePermissions]);

  // Группируем разрешения по префиксу (первая часть кода до первого двоеточия)
  const groupedPermissions = useMemo(() => {
    if (!allPermissions || !Array.isArray(allPermissions)) return [];

    const groups = new Map<string, Permission[]>();

    allPermissions.forEach((permission) => {
      const prefix = permission.code.split(":")[0] || "other";
      if (!groups.has(prefix)) {
        groups.set(prefix, []);
      }
      groups.get(prefix)!.push(permission);
    });

    // Сортируем группы по названию и разрешения внутри группы по коду
    const sortedGroups: GroupedPermissions[] = Array.from(groups.entries())
      .map(([prefix, permissions]) => ({
        prefix,
        permissions: permissions.sort((a, b) => a.code.localeCompare(b.code)),
      }))
      .sort((a, b) => a.prefix.localeCompare(b.prefix));

    return sortedGroups;
  }, [allPermissions]);

  // Проверяем, выбрано ли разрешение
  const isPermissionSelected = (permissionId: string) => {
    return selectedPermissions.has(permissionId);
  };

  // Переключаем выбор разрешения
  const togglePermission = (permissionId: string) => {
    setSelectedPermissions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId);
      } else {
        newSet.add(permissionId);
      }
      return newSet;
    });
  };

  // Выбрать все разрешения в группе
  const selectGroup = (group: GroupedPermissions) => {
    setSelectedPermissions((prev) => {
      const newSet = new Set(prev);
      group.permissions.forEach((p) => newSet.add(p.id));
      return newSet;
    });
  };

  // Снять выбор всех разрешений в группе
  const deselectGroup = (group: GroupedPermissions) => {
    setSelectedPermissions((prev) => {
      const newSet = new Set(prev);
      group.permissions.forEach((p) => newSet.delete(p.id));
      return newSet;
    });
  };

  // Проверяем, выбраны ли все разрешения в группе
  const isGroupFullySelected = (group: GroupedPermissions) => {
    return group.permissions.every((p) => selectedPermissions.has(p.id));
  };

  // Проверяем, выбрано ли хотя бы одно разрешение в группе
  const isGroupPartiallySelected = (group: GroupedPermissions) => {
    const selectedCount = group.permissions.filter((p) =>
      selectedPermissions.has(p.id)
    ).length;
    return selectedCount > 0 && selectedCount < group.permissions.length;
  };


  // Сохраняем изменения
  const handleSave = async () => {
    if (!rolePermissions) return;

    setIsSaving(true);
    const currentIds = new Set(rolePermissions.map((p) => p.id));
    const toAdd: string[] = [];
    const toRemove: string[] = [];

    // Находим разрешения для добавления
    selectedPermissions.forEach((id) => {
      if (!currentIds.has(id)) {
        toAdd.push(id);
      }
    });

    // Находим разрешения для удаления
    currentIds.forEach((id) => {
      if (!selectedPermissions.has(id)) {
        toRemove.push(id);
      }
    });

    try {
      // Выполняем все операции параллельно
      await Promise.all([
        ...toAdd.map((permissionId) =>
          assignPermissionMutation.mutateAsync({
            roleId: id,
            permissionId,
          })
        ),
        ...toRemove.map((permissionId) =>
          removePermissionMutation.mutateAsync({
            roleId: id,
            permissionId,
          })
        ),
      ]);

      toast.success(t("permissionsUpdated") as string);
    } catch (error) {
      toast.error(t("saveChangesError") as string);
    } finally {
      setIsSaving(false);
    }
  };

  // Проверяем, есть ли изменения
  const hasChanges = useMemo(() => {
    if (!rolePermissions) return false;
    const currentIds = new Set(rolePermissions.map((p) => p.id));
    if (currentIds.size !== selectedPermissions.size) return true;
    for (const id of currentIds) {
      if (!selectedPermissions.has(id)) return true;
    }
    for (const id of selectedPermissions) {
      if (!currentIds.has(id)) return true;
    }
    return false;
  }, [rolePermissions, selectedPermissions]);

  if (roleLoading || allPermissionsLoading || rolePermissionsLoading) {
    return (
      <Box gap={6}>
        <UI.Skeleton height={40} width={256} />
        <UI.Skeleton height={384} width="full" />
      </Box>
    );
  }

  if (!role) {
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
        crumbs={[{ label: tNav("roles") as string, href: "/roles" }, { label: role.name, href: `/roles/${role.id}` }, { label: t("rolePermissions") as string }]}
        title={`${t("rolePermissions") as string}: ${role.name}`}
        description={t("manageRolePermissions") as string}
        actions={
          <>
            <UI.Button onClick={handleSave} disabled={!hasChanges || isSaving}>
              <Save size={16} />
              {isSaving ? (t("saving") as string) : (t("saveChanges") as string)}
            </UI.Button>
          </>
        }
      />

      {/* Таблица разрешений */}
      <UI.Card>
        <UI.Card.Header>
          <UI.Card.Title>{t("allPermissions") as string}</UI.Card.Title>
          <UI.Card.Description>
            {t("selectPermissionsDescription") as string}
          </UI.Card.Description>
        </UI.Card.Header>
        <UI.Card.Content>
          {groupedPermissions.length === 0 ? (
            <UI.EmptyState paddingY={8}>
              <UI.Text variant="muted" size="sm">
                {t("noPermissionsAvailable") as string}
              </UI.Text>
            </UI.EmptyState>
          ) : (
            <Box gap={8}>
              {groupedPermissions.map((group) => (
                <Box key={group.prefix} gap={2}>
                  {/* Заголовок группы */}
                  <GroupCheckbox
                    group={group}
                    isFullySelected={isGroupFullySelected(group)}
                    isPartiallySelected={isGroupPartiallySelected(group)}
                    onSelect={() => selectGroup(group)}
                    onDeselect={() => deselectGroup(group)}
                  />

                  {/* Таблица разрешений группы */}
                  <Box variant="panel">
                    {/* min-width: при table-fixed пять колонок не помещаются в 390px — auto-колонка
                        «Описание» схлопывалась в ноль. Контейнер Table.Root — overflow-x-auto,
                        поэтому таблица скроллится внутри себя, а страница целиком не едет. */}
                    <UI.Table.Root layout="fixed" className="min-w-[640px]">
                      <UI.Table.Header>
                        <UI.Table.Row>
                          <UI.Table.Head className="w-10" />
                          <UI.Table.Head className="w-[26%]">{t("code") as string}</UI.Table.Head>
                          <UI.Table.Head className="w-[92px]">{t("method") as string}</UI.Table.Head>
                          <UI.Table.Head className="w-[30%]">{t("path") as string}</UI.Table.Head>
                          <UI.Table.Head>{t("description") as string}</UI.Table.Head>
                        </UI.Table.Row>
                      </UI.Table.Header>
                      <UI.Table.Body>
                        {group.permissions.map((permission) => {
                          const isSelected = isPermissionSelected(permission.id);

                          return (
                            <UI.Table.Row
                              key={permission.id}
                              data-state={isSelected ? "selected" : undefined}
                            >
                              <UI.Table.Cell className="align-top">
                                <UI.FormControl.Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() =>
                                    togglePermission(permission.id)
                                  }
                                  aria-label={`${t("view") as string} ${tNav("permissions") as string} ${permission.code}`}
                                />
                              </UI.Table.Cell>
                              <UI.Table.Cell className="whitespace-normal align-top">
                                <UI.Text as="span" variant="mono" size="sm" weight="medium" wrap="break">
                                  {permission.code}
                                </UI.Text>
                              </UI.Table.Cell>
                              <UI.Table.Cell className="align-top">
                                <UI.Badge
                                  variant="outline"
                                  tone={
                                    permission.method === "DELETE"
                                      ? "red"
                                      : permission.method === "POST"
                                        ? "green"
                                        : permission.method === "PUT"
                                          ? "orange"
                                          : undefined
                                  }
                                >
                                  {permission.method}
                                </UI.Badge>
                              </UI.Table.Cell>
                              <UI.Table.Cell className="whitespace-normal align-top">
                                <UI.Text as="span" variant="mono" size="sm" wrap="break">
                                  {permission.path}
                                </UI.Text>
                              </UI.Table.Cell>
                              <UI.Table.Cell className="whitespace-normal align-top">
                                <UI.Text as="span" variant="muted" size="sm" wrap="break">
                                  {permission.description || "—"}
                                </UI.Text>
                              </UI.Table.Cell>
                            </UI.Table.Row>
                          );
                        })}
                      </UI.Table.Body>
                    </UI.Table.Root>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </UI.Card.Content>
      </UI.Card>
    </Box>
  );
}
